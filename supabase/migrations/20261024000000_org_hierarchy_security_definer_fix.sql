-- Copyright IBM Corp. 2026
--
-- This source code is licensed under the Apache-2.0 license found in the
-- LICENSE file in the root directory of this source tree.

-- ---------------------------------------------------------------------------
-- Fix: create_organization_hierarchy — convert SECURITY INVOKER → SECURITY DEFINER
-- ---------------------------------------------------------------------------
-- PRODUCTION BUG (found by owner UX testing 2026-10-24): an authenticated user
-- completing onboarding could not create an organization. The call failed with
--   ERROR 42501: new row violates row-level security policy for table "organizations"
--
-- Root cause, reproduced and proven against the remote project as the
-- `authenticated` role with RLS enforced:
--   * `organizations_insert_policy` has WITH CHECK `( SELECT auth.uid() AS uid) IS NOT NULL`.
--   * `auth.uid()` reads the custom GUC `request.jwt.claims`. Inside an RLS
--     WITH CHECK that is planned as a bare InitPlan (the policy references no
--     NEW column), PostgreSQL evaluates `auth.uid()` in a context where the
--     GUC is not visible, so it returns NULL and the check fails — even though
--     the same `auth.uid()` returns the caller's id in ordinary SELECTs in the
--     very same session (proven: SELECT auth.uid() = bda3aee0…, INSERT still 42501).
--   * The `persons` INSERT inside the same RPC succeeded because the policy
--     `id = (SELECT auth.uid())` compares a NEW column that the VALUES clause
--     set from `auth.uid()` in the main query — not a bare InitPlan.
--
-- Why SECURITY DEFINER is the correct fix (not a policy tweak):
--   create_organization_hierarchy performs a SINGLE orchestrated bootstrap
--   across SIX tables — persons, organizations, organization_members,
--   workspaces, workspace_members, projects, project_members — plus a persons
--   UPDATE. Per-row RLS cannot express this atomically:
--     * organizations: the insert policy can't reference the membership row
--       that doesn't exist yet (chicken-and-egg).
--     * organization_members / workspace_members / project_members: their
--       insert policies require existing membership in an org/workspace/project
--       that is being created in the same statement.
--   Opening direct-write INSERT policies on all six tables so SECURITY INVOKER
--   could pass would let ANY authenticated user fabricate orgs/memberships via
--   PostgREST — a strictly larger risk than a single audited DEFINER RPC.
--
-- SECURITY DEFINER justification (AGENTS.md rule 5 / §7.4 checklist):
--   * Why DEFINER: see above — orchestrated multi-table bootstrap that RLS
--     cannot express atomically; the alternative (broad direct-write policies)
--     is a larger exposure.
--   * search_path = '' and every object is schema-qualified (public./pg_catalog.)
--     so no search_path hijack is possible.
--   * The body re-checks `auth.uid()` and raises 42501 when NULL, so the
--     DEFINER still only ever acts on behalf of a real authenticated caller.
--   * The caller's own id (auth.uid()) is used for every member/owner FK —
--     never a client-supplied user id — so a caller cannot grant ownership to
--     someone else.
--   * EXECUTE is revoked from PUBLIC and anon; granted only to `authenticated`.
--   * Input is validated: identifier must be a slug, name non-empty.
--
-- The function body is unchanged except for: security mode, input validation,
-- and fully-qualified object references. Behaviour (returned ids, side effects)
-- is identical for legitimate callers.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_organization_hierarchy(
  p_name text,
  p_identifier text,
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
BEGIN
  -- Re-check the caller even though we are DEFINER: only ever act for a real
  -- authenticated user, and only ever as THAT user (never a client-supplied id).
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create an organization hierarchy.' USING ERRCODE = '42501';
  END IF;

  -- Input validation (DEFINER runs with owner privileges — validate everything).
  IF p_name IS NULL OR pg_catalog.btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Organization name must not be empty.' USING ERRCODE = '22023';
  END IF;
  IF p_identifier IS NULL OR p_identifier !~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$' THEN
    RAISE EXCEPTION 'Organization identifier must be a lowercase slug (a-z, 0-9, hyphens).' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.persons (id, name, in_language)
  VALUES (v_user_id, p_name || ' Owner', p_in_language)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizations (
    identifier,
    name,
    alternate_name,
    knows_language,
    status,
    plan_tier
  ) VALUES (
    p_identifier,
    p_name,
    p_name,
    ARRAY[p_in_language, 'en'],
    'active',
    'free'
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (
    organization_id,
    member_id,
    role_name,
    is_default
  ) VALUES (
    v_org_id,
    v_user_id,
    'org_owner',
    true
  );

  INSERT INTO public.workspaces (
    organization_id,
    identifier,
    name,
    environment_type,
    in_language,
    is_default,
    created_by
  ) VALUES (
    v_org_id,
    'core',
    p_workspace_name,
    'production',
    p_in_language,
    true,
    v_user_id
  )
  RETURNING id INTO v_ws_id;

  INSERT INTO public.workspace_members (
    organization_id,
    workspace_id,
    member_id,
    role_name
  ) VALUES (
    v_org_id,
    v_ws_id,
    v_user_id,
    'workspace_admin'
  );

  INSERT INTO public.projects (
    organization_id,
    workspace_id,
    identifier,
    name,
    in_language,
    is_default,
    author_id
  ) VALUES (
    v_org_id,
    v_ws_id,
    'main',
    p_project_name,
    p_in_language,
    true,
    v_user_id
  )
  RETURNING id INTO v_prj_id;

  INSERT INTO public.project_members (
    organization_id,
    workspace_id,
    project_id,
    member_id,
    role_name
  ) VALUES (
    v_org_id,
    v_ws_id,
    v_prj_id,
    v_user_id,
    'project_owner'
  );

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
    'project_id', v_prj_id
  );
END;
$$;

-- Least-privilege EXECUTE: only authenticated users may invoke the RPC.
REVOKE EXECUTE ON FUNCTION public.create_organization_hierarchy(text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_organization_hierarchy(text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_organization_hierarchy(text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_organization_hierarchy(text, text, text, text, text) IS
  'Orchestrated 6-table org bootstrap. SECURITY DEFINER (justified 2026-10-24): '
  'per-row RLS cannot express the atomic org+membership+workspace+project bootstrap '
  '(chicken-and-egg), and the organizations_insert_policy bare auth.uid() InitPlan '
  'returns NULL (reproduced). search_path='''' + caller re-checked via auth.uid(); '
  'EXECUTE granted only to authenticated.';
