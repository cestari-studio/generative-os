-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- RLS-enforced tests for the forward-only switch_active_context hierarchy fix.

\set ON_ERROR_STOP on

DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.workspaces CASCADE;
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  status text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.projects (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  status text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY switch_context_workspaces_read ON public.workspaces
  FOR SELECT TO authenticated USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY switch_context_projects_read ON public.projects
  FOR SELECT TO authenticated USING ((SELECT app_private.is_org_member(organization_id)));
GRANT SELECT ON public.workspaces, public.projects TO authenticated;

INSERT INTO public.workspaces (id, organization_id, status, is_default) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active', true),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active', false),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'archived', false),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'active', true);

INSERT INTO public.projects (id, organization_id, workspace_id, status, is_default) VALUES
  ('aaaaaaaa-1000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'active', true),
  ('aaaaaaaa-1000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000002', 'active', true),
  ('aaaaaaaa-1000-4000-8000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'archived', false),
  ('bbbbbbbb-1000-4000-8000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-4000-8000-000000000001', 'active', true);

DO $$
DECLARE
  v_result jsonb;
  v_count integer := 0;
  v_org uuid;
  v_workspace uuid;
  v_project uuid;
BEGIN
  RAISE NOTICE '=== switch_active_context hierarchy assertions ===';

  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

  v_result := public.switch_active_context(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-4000-8000-000000000001',
    'aaaaaaaa-1000-4000-8000-000000000001'
  );
  IF v_result->>'active_organization_id' <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     OR v_result->>'active_workspace_id' <> 'aaaaaaaa-0000-4000-8000-000000000001'
     OR v_result->>'active_project_id' <> 'aaaaaaaa-1000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: valid organization/workspace/project context was not selected: %', v_result;
  END IF;
  v_count := v_count + 1;
  RAISE NOTICE 'OK %: valid context is accepted', v_count;

  BEGIN
    PERFORM public.switch_active_context(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-0000-4000-8000-000000000001', NULL
    );
    RAISE EXCEPTION 'ASSERTION FAILED: workspace from another organization was accepted' USING ERRCODE = 'P0001';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  v_count := v_count + 1;
  RAISE NOTICE 'OK %: workspace from another organization is denied', v_count;

  BEGIN
    PERFORM public.switch_active_context(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-4000-8000-000000000001',
      'aaaaaaaa-1000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'ASSERTION FAILED: project from another workspace was accepted' USING ERRCODE = 'P0001';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  v_count := v_count + 1;
  RAISE NOTICE 'OK %: project from another workspace is denied', v_count;

  BEGIN
    PERFORM public.switch_active_context(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-4000-8000-000000000001',
      'bbbbbbbb-1000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'ASSERTION FAILED: project from another organization was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  v_count := v_count + 1;
  RAISE NOTICE 'OK %: project from another organization is denied', v_count;

  BEGIN
    PERFORM public.switch_active_context(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-4000-8000-000000000003', NULL
    );
    RAISE EXCEPTION 'ASSERTION FAILED: archived workspace was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  v_count := v_count + 1;
  RAISE NOTICE 'OK %: archived workspace is denied', v_count;

  BEGIN
    PERFORM public.switch_active_context(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-4000-8000-000000000001',
      'aaaaaaaa-1000-4000-8000-000000000003'
    );
    RAISE EXCEPTION 'ASSERTION FAILED: archived project was accepted' USING ERRCODE = 'P0001';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  v_count := v_count + 1;
  RAISE NOTICE 'OK %: archived project is denied', v_count;

  v_result := public.switch_active_context('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, NULL);
  IF v_result->>'active_workspace_id' <> 'aaaaaaaa-0000-4000-8000-000000000001'
     OR v_result->>'active_project_id' <> 'aaaaaaaa-1000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: default active hierarchy selection is wrong: %', v_result;
  END IF;
  v_count := v_count + 1;
  RAISE NOTICE 'OK %: omitted workspace/project resolve to active defaults inside the organization', v_count;

  SELECT active_organization_id, active_workspace_id, active_project_id
    INTO v_org, v_workspace, v_project
    FROM public.persons
   WHERE id = auth.uid();
  IF v_org <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     OR v_workspace <> 'aaaaaaaa-0000-4000-8000-000000000001'
     OR v_project <> 'aaaaaaaa-1000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: rejected requests changed the persisted active context';
  END IF;
  v_count := v_count + 1;
  RAISE NOTICE 'OK %: denied requests leave the last valid active context intact', v_count;

  RESET ROLE;
  RAISE NOTICE '=== ALL % SWITCH CONTEXT ASSERTIONS PASSED ===', v_count;
END;
$$;
