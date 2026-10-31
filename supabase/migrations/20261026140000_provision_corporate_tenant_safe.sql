-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the
-- root directory of this source tree.
--
-- 20261026140000_provision_corporate_tenant_safe.sql
--
-- P0 (Master Directive §6.2 + reviewer): create_or_update_corporate_tenant has TWO
-- independent defects that a grant-tightening alone cannot fix:
--
--   DEFECT A (InitPlan RLS bug): organizations_insert_policy's WITH CHECK cannot
--     evaluate auth.uid() inside a bare InitPlan, so the org INSERT fails RLS for
--     authenticated users on the REAL remote (reproduced: direct org INSERT as
--     authenticated -> 42501). This is the same bug fixed earlier in
--     create_organization_hierarchy (20261024000000) via SECURITY DEFINER.
--
--   DEFECT B (authenticated takeover): ON CONFLICT (identifier) DO UPDATE
--     overwrites an existing org's legal/tax/legal_representative data, and the
--     member INSERT promotes the caller to org_owner of the VICTIM org
--     (ON CONFLICT (organization_id, member_id) DO UPDATE SET role_name='org_owner',
--     is_default=true). Any authenticated user B who knows org A's identifier can
--     seize it. organizations_update_policy (has_org_admin_role) blocks the data
--     UPDATE for a non-member, but organization_members_insert_policy
--     (member_id = auth.uid()) lets B insert themselves — and the function then
--     tries to set them as org_owner + hijack their active context.
--
-- Fix (architectural, per the org-hierarchy precedent): a NEW SECURITY DEFINER
-- provisioning RPC that is BOTH InitPlan-safe AND takeover-safe:
--   * SECURITY DEFINER (justified, AGENTS.md rule 5): a 6-table atomic bootstrap
--     (org + owner membership + workspace + workspace_admin + project + project_owner
--     + person context) that per-row RLS cannot express; search_path='' + qualified
--     objects; auth.uid() re-checked in body; EXECUTE granted only to authenticated.
--   * CREATE vs UPDATE separation: if the identifier already exists, the function
--     does NOT overwrite org data and does NOT promote the caller. It requires the
--     caller to ALREADY be org_owner/org_admin of that org to proceed (otherwise
--     it raises a takeover denial). A conflict is NEVER treated as proof of ownership.
--   * The caller is registered as org_owner ONLY on a fresh create.
--
-- ADDITIVE ONLY: creates the new function; does NOT alter, drop or revoke the old
-- create_or_update_corporate_tenant (deprecation is a separate owner decision).
-- DRAFT — validated on disposable PostgreSQL 17.11; NOT applied remotely.

CREATE OR REPLACE FUNCTION public.provision_corporate_tenant(
  p_name text,
  p_identifier text,
  p_legal_name text DEFAULT NULL,
  p_tax_id text DEFAULT NULL,
  p_country_code text DEFAULT 'BR',
  p_size_category text DEFAULT 'MICRO',
  p_revenue_range text DEFAULT NULL,
  p_registration_number text DEFAULT NULL,
  p_industry_code text DEFAULT NULL,
  p_address jsonb DEFAULT '{}'::jsonb,
  p_in_language text DEFAULT 'pt-BR',
  p_workspace_name text DEFAULT 'Core Workspace',
  p_project_name text DEFAULT 'Default Project'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_org_id uuid;
  v_ws_id uuid;
  v_prj_id uuid;
  v_existing_id uuid;
  v_is_admin boolean;
BEGIN
  -- Re-check the caller even though we are DEFINER: only ever act for a real
  -- authenticated user, and only ever as THAT user (never a client-supplied id).
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to provision a corporate tenant.' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR pg_catalog.btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Organization name must not be empty.' USING ERRCODE = '22023';
  END IF;
  IF p_identifier IS NULL OR p_identifier !~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$' THEN
    RAISE EXCEPTION 'Organization identifier must be a lowercase slug (a-z, 0-9, hyphens).' USING ERRCODE = '22023';
  END IF;

  -- -------------------------------------------------------------------------
  -- TAKEOVER GUARD (DEFECT B): if the identifier already exists, the caller must
  -- ALREADY be org_owner/org_admin of that org. A conflict is NEVER proof of
  -- ownership, and we NEVER overwrite org data or promote a non-admin caller.
  -- -------------------------------------------------------------------------
  SELECT id INTO v_existing_id FROM public.organizations WHERE identifier = p_identifier;
  IF FOUND THEN
    SELECT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = v_existing_id
        AND om.member_id = v_user_id
        AND om.role_name IN ('org_owner', 'org_admin')
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Organization identifier % is already in use by an organization you do not administer. Provisioning a tenant over an existing identifier is not permitted.', p_identifier
        USING ERRCODE = '42501';
    END IF;

    -- Admin of an existing org: return the existing org + its default core/main
    -- context WITHOUT mutating org data or re-promoting. This is an idempotent
    -- read-back, not a takeover-capable update.
    v_org_id := v_existing_id;
    SELECT id INTO v_ws_id FROM public.workspaces WHERE organization_id = v_org_id AND identifier = 'core';
    SELECT id INTO v_prj_id FROM public.projects WHERE organization_id = v_org_id AND identifier = 'main';

    RETURN pg_catalog.jsonb_build_object(
      '@context', 'https://schema.org',
      '@type', 'Organization',
      'organization_id', v_org_id,
      'workspace_id', v_ws_id,
      'project_id', v_prj_id,
      'provisioned', false,
      'already_existed', true
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- FRESH CREATE (identifier is new): create the org and register the caller as
  -- org_owner. Only here is the caller promoted — never on a conflict.
  -- -------------------------------------------------------------------------
  INSERT INTO public.organizations (
    identifier, name, legal_name, tax_id, country_code, size_category, revenue_range,
    registration_number, industry_code, address, knows_language, legal_representative_id, status, plan_tier
  ) VALUES (
    p_identifier, p_name, p_legal_name, p_tax_id, p_country_code, p_size_category, p_revenue_range,
    p_registration_number, p_industry_code, p_address, ARRAY[p_in_language, 'en'], v_user_id, 'active', 'free'
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, member_id, role_name, named_position, is_default)
  VALUES (v_org_id, v_user_id, 'org_owner', 'Legal Representative', true);

  INSERT INTO public.workspaces (organization_id, identifier, name, environment_type, in_language, is_default, created_by)
  VALUES (v_org_id, 'core', p_workspace_name, 'production', p_in_language, true, v_user_id)
  RETURNING id INTO v_ws_id;

  INSERT INTO public.workspace_members (organization_id, workspace_id, member_id, role_name)
  VALUES (v_org_id, v_ws_id, v_user_id, 'workspace_admin');

  INSERT INTO public.projects (organization_id, workspace_id, identifier, name, in_language, is_default, author_id)
  VALUES (v_org_id, v_ws_id, 'main', p_project_name, p_in_language, true, v_user_id)
  RETURNING id INTO v_prj_id;

  INSERT INTO public.project_members (organization_id, workspace_id, project_id, member_id, role_name)
  VALUES (v_org_id, v_ws_id, v_prj_id, v_user_id, 'project_owner');

  UPDATE public.persons
  SET works_for_id = COALESCE(works_for_id, v_org_id),
      active_organization_id = v_org_id,
      active_workspace_id = v_ws_id,
      active_project_id = v_prj_id
  WHERE id = v_user_id;

  RETURN pg_catalog.jsonb_build_object(
    '@context', 'https://schema.org',
    '@type', 'Organization',
    'organization_id', v_org_id,
    'workspace_id', v_ws_id,
    'project_id', v_prj_id,
    'provisioned', true,
    'already_existed', false
  );
END;
$$;

-- Least-privilege EXECUTE: authenticated only (the browser TenantContext path).
REVOKE EXECUTE ON FUNCTION public.provision_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provision_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.provision_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.provision_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) IS
  'Safe corporate-tenant provisioning (Master Directive §6.2). SECURITY DEFINER (justified: 6-table atomic bootstrap per-row RLS cannot express, and the organizations INSERT InitPlan RLS bug). CREATE vs conflict separation: a conflicting identifier requires the caller to ALREADY be org_owner/org_admin (else 42501 takeover denial); NEVER overwrites org data and NEVER promotes a non-admin caller on conflict. Caller is org_owner only on a fresh create. Successor to create_or_update_corporate_tenant (which remains for backward-compat pending owner deprecation decision).';
