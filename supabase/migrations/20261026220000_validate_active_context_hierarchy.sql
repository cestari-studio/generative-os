-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Validate every context pointer against the authenticated organization before
-- persisting it. The original switch_active_context checked organization
-- membership but accepted arbitrary workspace/project IDs supplied by a client.
-- This forward-only replacement rejects cross-organization workspaces,
-- cross-workspace projects, and inactive hierarchy nodes.

CREATE OR REPLACE FUNCTION public.switch_active_context(
  p_organization_id uuid,
  p_workspace_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_ws_id uuid := p_workspace_id;
  v_prj_id uuid := p_project_id;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT (SELECT app_private.is_org_member(p_organization_id)) THEN
    RAISE EXCEPTION 'Access denied to target organization.' USING ERRCODE = '42501';
  END IF;

  IF v_ws_id IS NULL THEN
    SELECT w.id INTO v_ws_id
      FROM public.workspaces w
     WHERE w.organization_id = p_organization_id
       AND w.status = 'active'
     ORDER BY w.is_default DESC, w.created_at ASC
     LIMIT 1;
  ELSIF NOT EXISTS (
    SELECT 1
      FROM public.workspaces w
     WHERE w.id = v_ws_id
       AND w.organization_id = p_organization_id
       AND w.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Workspace is not active in the target organization.' USING ERRCODE = '42501';
  END IF;

  IF v_prj_id IS NULL AND v_ws_id IS NOT NULL THEN
    SELECT p.id INTO v_prj_id
      FROM public.projects p
     WHERE p.organization_id = p_organization_id
       AND p.workspace_id = v_ws_id
       AND p.status = 'active'
     ORDER BY p.is_default DESC, p.created_at ASC
     LIMIT 1;
  ELSIF v_prj_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.projects p
     WHERE p.id = v_prj_id
       AND p.organization_id = p_organization_id
       AND p.workspace_id = v_ws_id
       AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Project is not active in the selected workspace and organization.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.persons
     SET active_organization_id = p_organization_id,
         active_workspace_id = v_ws_id,
         active_project_id = v_prj_id,
         updated_at = pg_catalog.now()
   WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person profile is not available for the authenticated user.' USING ERRCODE = '42501';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'active_organization_id', p_organization_id,
    'active_workspace_id', v_ws_id,
    'active_project_id', v_prj_id
  );
END;
$$;

COMMENT ON FUNCTION public.switch_active_context(uuid, uuid, uuid) IS
  'Authenticated context switch. SECURITY INVOKER; validates membership plus active workspace/project organization and parent relationships before updating the caller-owned persons row.';
