-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Prerequisites for the 3 anon-RPC grant test (disposable DB only).
-- Stub the 3 RPCs with the SAME signatures as live + pre-fix anon grants.
--
-- The tenant tables + RLS fixture come from _prereq_provision_tenant.sql so
-- the BEHAVIORAL stub of create_or_update_corporate_tenant below reproduces
-- the REAL legacy conflict-update behavior from 20261018225420
-- (ON CONFLICT (identifier) DO UPDATE org data + promote the caller to
-- org_owner of the victim org). The provision_corporate_tenant REAL body is
-- applied by the harnesses from migration 20261026140000 (its InitPlan-safe
-- DEFINER body is what actually runs in the behavioral assertions).

\ir _prereq_provision_tenant.sql

CREATE OR REPLACE FUNCTION public.save_onboarding_progress(
  p_account_type text, p_country_code text, p_current_step integer, p_step_data jsonb, p_is_completed boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  RETURN pg_catalog.jsonb_build_object('saved', true);
END; $$;

-- BEHAVIORAL stub: faithful mirror of the legacy body in
-- 20261018225420_onboarding_pf_pj_multi_country_and_chinese.sql — SECURITY
-- INVOKER, ON CONFLICT (identifier) DO UPDATE (org data + legal rep), caller
-- promoted to org_owner ON CONFLICT, active context switched. This is the
-- OPEN takeover vector the Stage-2 restriction (20261026210000) closes at the
-- grant layer.
CREATE OR REPLACE FUNCTION public.create_or_update_corporate_tenant(
  p_name text, p_identifier text, p_legal_name text DEFAULT NULL, p_tax_id text DEFAULT NULL,
  p_country_code text DEFAULT 'BR', p_size_category text DEFAULT 'MICRO',
  p_revenue_range text DEFAULT NULL, p_registration_number text DEFAULT NULL,
  p_industry_code text DEFAULT NULL, p_address jsonb DEFAULT '{}'::jsonb,
  p_in_language text DEFAULT 'pt-BR', p_workspace_name text DEFAULT 'Core Workspace',
  p_project_name text DEFAULT 'Default Project'
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_org_id uuid;
  v_ws_id uuid;
  v_prj_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;

  -- 1. Create or update Organization (conflict = UPDATE the victim's data)
  INSERT INTO public.organizations (
    identifier, name, legal_name, tax_id, country_code, size_category, revenue_range,
    registration_number, industry_code, address, knows_language, legal_representative_id, status, plan_tier
  ) VALUES (
    p_identifier, p_name, p_legal_name, p_tax_id, p_country_code, p_size_category, p_revenue_range,
    p_registration_number, p_industry_code, p_address, ARRAY[p_in_language, 'en'], v_user_id, 'active', 'free'
  )
  ON CONFLICT (identifier) DO UPDATE
  SET legal_name = EXCLUDED.legal_name,
      tax_id = EXCLUDED.tax_id,
      country_code = EXCLUDED.country_code,
      size_category = EXCLUDED.size_category,
      revenue_range = EXCLUDED.revenue_range,
      registration_number = EXCLUDED.registration_number,
      industry_code = EXCLUDED.industry_code,
      address = EXCLUDED.address,
      legal_representative_id = EXCLUDED.legal_representative_id,
      updated_at = pg_catalog.now()
  RETURNING id INTO v_org_id;

  -- 2. Register caller as org_owner (conflict = PROMOTE the caller)
  INSERT INTO public.organization_members (organization_id, member_id, role_name, named_position, is_default)
  VALUES (v_org_id, v_user_id, 'org_owner', 'Legal Representative', true)
  ON CONFLICT (organization_id, member_id) DO UPDATE
  SET role_name = 'org_owner', is_default = true, updated_at = pg_catalog.now();

  -- 3. Provision Default Workspace if not present
  SELECT id INTO v_ws_id FROM public.workspaces WHERE organization_id = v_org_id AND identifier = 'core';
  IF v_ws_id IS NULL THEN
    INSERT INTO public.workspaces (organization_id, identifier, name, environment_type, in_language, is_default, created_by)
    VALUES (v_org_id, 'core', p_workspace_name, 'production', p_in_language, true, v_user_id)
    RETURNING id INTO v_ws_id;

    INSERT INTO public.workspace_members (organization_id, workspace_id, member_id, role_name)
    VALUES (v_org_id, v_ws_id, v_user_id, 'workspace_admin')
    ON CONFLICT (workspace_id, member_id) DO NOTHING;
  END IF;

  -- 4. Provision Default Project if not present
  SELECT id INTO v_prj_id FROM public.projects WHERE workspace_id = v_ws_id AND identifier = 'main';
  IF v_prj_id IS NULL THEN
    INSERT INTO public.projects (organization_id, workspace_id, identifier, name, in_language, is_default, author_id)
    VALUES (v_org_id, v_ws_id, 'main', p_project_name, p_in_language, true, v_user_id)
    RETURNING id INTO v_prj_id;

    INSERT INTO public.project_members (organization_id, workspace_id, project_id, member_id, role_name)
    VALUES (v_org_id, v_ws_id, v_prj_id, v_user_id, 'project_owner')
    ON CONFLICT (project_id, member_id) DO NOTHING;
  END IF;

  -- 5. Switch person's active context
  UPDATE public.persons
  SET works_for_id = v_org_id,
      active_organization_id = v_org_id,
      active_workspace_id = v_ws_id,
      active_project_id = v_prj_id,
      account_type = 'organization_member',
      country_code = p_country_code,
      updated_at = pg_catalog.now()
  WHERE id = v_user_id;

  RETURN pg_catalog.jsonb_build_object(
    '@context', 'https://schema.org',
    '@type', 'Organization',
    'organization_id', v_org_id,
    'workspace_id', v_ws_id,
    'project_id', v_prj_id,
    'size_category', p_size_category,
    'country_code', p_country_code
  );
END; $$;

CREATE OR REPLACE FUNCTION public.resolve_effective_settings(
  p_organization_id uuid, p_workspace_id uuid, p_project_id uuid, p_person_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RETURN '[]'::jsonb;
END; $$;

-- Simulate the LIVE (pre-fix) state: all 3 legacy RPCs executable by anon +
-- PUBLIC (+ authenticated + service_role). provision_corporate_tenant itself is
-- created (and granted) by the harness from migration 20261026140000 — the
-- takeover-safe DEFINER body is what runs in the behavioral assertions.
GRANT EXECUTE ON FUNCTION public.save_onboarding_progress(text, text, integer, jsonb, boolean) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_effective_settings(uuid, uuid, uuid, uuid) TO PUBLIC, anon, authenticated, service_role;

-- Live-mirroring surface for the legacy SECURITY INVOKER RPC (it writes with
-- the CALLER's privileges). On live, authenticated holds the table-level
-- INSERT/UPDATE/SELECT grants on organizations (the RPC worked from
-- TenantContext). The org INSERT policy is InitPlan-safe on live (the RPC
-- could insert orgs), so we replace the fixture's InitPlan-BUGGED insert
-- policy (which mirrors the direct-insert DEFECT A) with the InitPlan-safe
-- equivalent — the legacy RPC on live never hit DEFECT A.
--
-- POLICY VARIANTS (psql -v alter_policies=true|false):
--   alter_policies=true  — the PERMISSIVE live variant the takeover was
--     verified against: organizations_select_policy USING(true) (the RPC's
--     RETURNING can read the victim org back) and organizations_update_policy
--     USING(true)/WITH CHECK(true) (the conflict-UPDATE overwrites org data).
--     Under this variant the FULL takeover succeeds: data overwrite + legal-
--     representative replacement + promote-to-owner + context bind.
--   alter_policies=false (default) — the hardened 20261017231645 variant
--     (has_org_admin_role update policy + member-only select): the org-data
--     overwrite is blocked for a non-member attacker, but the member-promote
--     INSERT (member_id=auth.uid()) and persons UPDATE (id=auth.uid()) still
--     let the attacker be promoted and context-bound once the org statement
--     is reached — the promote-only variant documented in 20261026140000.
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
-- The legacy RPC promotes the caller via organization_members INSERT and
-- provisions workspace/project rows when absent (live grants: the RPC worked
-- from TenantContext end-to-end).
GRANT INSERT, UPDATE ON public.organization_members TO authenticated;
GRANT INSERT ON public.workspaces TO authenticated;
GRANT INSERT ON public.workspace_members TO authenticated;
GRANT INSERT ON public.projects TO authenticated;
GRANT INSERT ON public.project_members TO authenticated;
-- The legacy RPC's existence checks (SELECT core workspace / main project)
-- must see the already-provisioned rows or it tries to re-provision them.
GRANT SELECT ON public.workspace_members TO authenticated;
GRANT SELECT ON public.project_members TO authenticated;
-- The child tables have RLS enabled with NO policies in the base fixture
-- (default-deny), which contradicts the verified live behavior (the legacy
-- RPC provisioned workspace/project rows end-to-end from TenantContext).
-- Mirror the live surface: authenticated can SEE the core/main rows (so the
-- RPC's existence checks skip re-provisioning) and INSERT when absent.
CREATE POLICY workspaces_select_policy ON public.workspaces FOR SELECT TO authenticated USING (true);
CREATE POLICY workspaces_insert_policy ON public.workspaces FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY workspace_members_insert_policy ON public.workspace_members FOR INSERT TO authenticated WITH CHECK (member_id = (SELECT auth.uid()));
CREATE POLICY workspace_members_select_policy ON public.workspace_members FOR SELECT TO authenticated USING (true);
CREATE POLICY projects_select_policy ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY projects_insert_policy ON public.projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY project_members_insert_policy ON public.project_members FOR INSERT TO authenticated WITH CHECK (member_id = (SELECT auth.uid()));
CREATE POLICY project_members_select_policy ON public.project_members FOR SELECT TO authenticated USING (true);
-- Supabase convention (mirrors live): service_role has full table access and
-- an all-access policy on every tenant table, so SECURITY INVOKER RPCs run
-- end-to-end under service_role.
GRANT SELECT, INSERT, UPDATE ON public.organizations TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.organization_members TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.workspaces TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.workspace_members TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.projects TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.project_members TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.persons TO service_role;
CREATE POLICY organizations_service_all ON public.organizations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY organization_members_service_all ON public.organization_members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY workspaces_service_all ON public.workspaces FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY workspace_members_service_all ON public.workspace_members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY projects_service_all ON public.projects FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY project_members_service_all ON public.project_members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY persons_service_all ON public.persons FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE OR REPLACE FUNCTION app_private.has_org_admin_role(p_org_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = p_org_id
                 AND om.member_id = (SELECT auth.uid()) AND om.role_name IN ('org_owner', 'org_admin'));
$$;
CREATE OR REPLACE FUNCTION app_private.is_authenticated() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL;
$$;
GRANT USAGE ON SCHEMA app_private TO authenticated;

DROP POLICY organizations_insert_policy ON public.organizations;
CREATE POLICY organizations_insert_policy ON public.organizations FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_private.is_authenticated()));

\if :{?alter_policies}
\else
  \set alter_policies false
\endif
\if :alter_policies
  -- PERMISSIVE variant (the verified live takeover surface): SELECT open so
  -- the RPC's RETURNING reads the victim org back; UPDATE open so the
  -- conflict-UPDATE overwrites org data (legal/tax/legal-rep).
  DROP POLICY organizations_select_policy ON public.organizations;
  CREATE POLICY organizations_select_policy ON public.organizations FOR SELECT TO authenticated
    USING (true);
  CREATE POLICY organizations_update_policy ON public.organizations FOR UPDATE TO authenticated
    USING (true) WITH CHECK (true);
  \echo '>> _prereq_rpc_grants: PERMISSIVE organizations policies installed (alter_policies=true)'
\else
  -- HARDENED 20261017231645 variant: SELECT stays member-only (RETURNING
  -- blocked for a non-member) and UPDATE requires EXISTING owner/admin
  -- membership (conflict-UPDATE blocked) — the org statement therefore aborts
  -- the whole legacy call BEFORE the promote. This is the safest live
  -- reading; the permissive variant above is the one the full takeover was
  -- verified against.
  CREATE POLICY organizations_update_policy ON public.organizations FOR UPDATE TO authenticated
    USING ((SELECT app_private.has_org_admin_role(id))) WITH CHECK ((SELECT app_private.has_org_admin_role(id)));
  \echo '>> _prereq_rpc_grants: HARDENED organizations policies installed (alter_policies=false)'
\endif
