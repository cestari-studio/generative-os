-- ============================================================================
-- genOS / Cestari Studio — Workspace management: create_workspace RPC
-- ============================================================================
-- Additive-only migration: introduces the standalone workspace-creation
-- contract (normative slice 6.1 — product.client_ops.workspaces_access
-- features: client_workspace_create, workspace_member_access,
-- workspace_configure). Until now workspaces were only created inside
-- create_organization_hierarchy / create_or_update_corporate_tenant; this RPC
-- lets an org admin create additional workspaces inside an existing org.
--
-- STATUS: pending schema reconciliation before apply (same gate as billing
-- and catalog). Validated on disposable PostgreSQL 17.11 with RLS enforced
-- as the authenticated role. NOT applied to any remote yet.
--
-- Conventions: SECURITY INVOKER, search_path='', auth.uid() + org-admin
-- check inside the body, RLS stays the primary boundary (the function runs
-- with the caller's privileges, so the workspaces INSERT policy also applies).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_workspace(
  p_organization_id uuid,
  p_identifier text,
  p_name text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_workspace public.workspaces;
BEGIN
  -- 1. Authenticated caller required.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege: authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Org-admin (or platform super-admin) required — creating a workspace
  --    mutates the tenant structure, so plain membership is not enough.
  IF NOT (SELECT app_private.has_org_admin_role(p_organization_id)) THEN
    RAISE EXCEPTION 'insufficient_privilege: org admin role required to create workspaces' USING ERRCODE = '42501';
  END IF;

  -- 3. Input validation (server-side, never trust the browser).
  IF p_identifier IS NULL OR btrim(p_identifier) = '' THEN
    RAISE EXCEPTION 'invalid input: identifier is required' USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'invalid input: name is required' USING ERRCODE = '22023';
  END IF;

  -- 4. Insert; uniqueness of (organization_id, identifier) is enforced by
  --    the workspaces unique constraint — a duplicate raises unique_violation.
  INSERT INTO public.workspaces (organization_id, identifier, name, description, created_by)
  VALUES (p_organization_id, lower(btrim(p_identifier)), btrim(p_name), p_description, v_user_id)
  RETURNING * INTO v_workspace;

  RETURN jsonb_build_object(
    'id', v_workspace.id,
    'organization_id', v_workspace.organization_id,
    'identifier', v_workspace.identifier,
    'name', v_workspace.name,
    'created_by', v_workspace.created_by,
    'created_at', v_workspace.created_at
  );
END;
$$;

COMMENT ON FUNCTION public.create_workspace(uuid, text, text, text) IS
  'Creates a workspace inside an existing organization. Caller must be an org admin/owner (or platform super-admin); SECURITY INVOKER so RLS INSERT policies also apply.';

GRANT EXECUTE ON FUNCTION public.create_workspace(uuid, text, text, text) TO authenticated;
