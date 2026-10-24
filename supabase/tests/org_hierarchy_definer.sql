-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Assertions for create_organization_hierarchy as SECURITY DEFINER, run as the
-- `authenticated` role with RLS enforced (never owner/superuser).
--
-- Coverage:
--   1. The REAL organizations_insert_policy (bare auth.uid() InitPlan) still
--      blocks a DIRECT org INSERT (proves the bug exists in this DB).
--   2. The DEFINER RPC succeeds anyway (happy path) — creates org + membership
--      + workspace + project + persons update, all owned by the CALLER.
--   3. Anonymous caller (auth.uid() NULL) is denied with 42501.
--   4. Invalid identifier slug is rejected (input validation).
--   5. Empty name is rejected (input validation).
--   6. The created rows belong to the CALLER's auth.uid(), not anyone else.

\set QUIET on
\pset footer off

\set caller_a '''11111111-1111-1111-1111-111111111111'''
\set caller_b '''22222222-2222-2222-2222-222222222222'''

DO $$
DECLARE
  v_assert_count int := 0;
  v_result jsonb;
  v_org_id uuid;
  v_ws_id uuid;
  v_prj_id uuid;
  v_count int;
  v_text text;
BEGIN
  RAISE NOTICE '=== create_organization_hierarchy SECURITY DEFINER assertions ===';

  -- -------------------------------------------------------------------------
  -- 1. Baseline: the REAL insert policy blocks a DIRECT org insert as caller A.
  --    (Proves the bug the DEFINER RPC fixes is present in this disposable DB.)
  -- -------------------------------------------------------------------------
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  BEGIN
    INSERT INTO public.organizations (identifier, name) VALUES ('direct-blocked', 'Direct Blocked');
    RAISE EXCEPTION 'ASSERTION FAILED: direct org INSERT should have been blocked by RLS';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert_count := v_assert_count + 1;
    RAISE NOTICE 'OK %: direct org INSERT blocked by RLS policy (bug reproduced)', v_assert_count;
  END;
  RESET ROLE;

  -- -------------------------------------------------------------------------
  -- 2. Happy path: the DEFINER RPC succeeds as caller A despite the broken policy.
  -- -------------------------------------------------------------------------
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  SELECT public.create_organization_hierarchy('Acme Corp', 'acme-corp', 'en', 'Core WS', 'Main Proj')
    INTO v_result;
  RESET ROLE;

  v_org_id := (v_result ->> 'organization_id')::uuid;
  v_ws_id  := (v_result ->> 'workspace_id')::uuid;
  v_prj_id := (v_result ->> 'project_id')::uuid;

  IF v_org_id IS NULL OR v_ws_id IS NULL OR v_prj_id IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: RPC returned NULL ids: %', v_result;
  END IF;
  v_assert_count := v_assert_count + 1;
  RAISE NOTICE 'OK %: DEFINER RPC succeeded (org % / ws % / proj %)', v_assert_count, v_org_id, v_ws_id, v_prj_id;

  -- org row exists with the right identifier
  SELECT count(*) INTO v_count FROM public.organizations WHERE id = v_org_id AND identifier = 'acme-corp' AND name = 'Acme Corp';
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: org row mismatch'; END IF;
  v_assert_count := v_assert_count + 1;
  RAISE NOTICE 'OK %: organization row created with correct identifier/name', v_assert_count;

  -- caller A is org_owner of the new org (membership row belongs to the caller)
  SELECT count(*) INTO v_count FROM public.organization_members
    WHERE organization_id = v_org_id AND member_id = '11111111-1111-1111-1111-111111111111' AND role_name = 'org_owner' AND is_default;
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: caller not org_owner'; END IF;
  v_assert_count := v_assert_count + 1;
  RAISE NOTICE 'OK %: caller is org_owner of the new org', v_assert_count;

  -- workspace + workspace_membership
  SELECT count(*) INTO v_count FROM public.workspaces WHERE id = v_ws_id AND organization_id = v_org_id AND identifier = 'core';
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: workspace row mismatch'; END IF;
  SELECT count(*) INTO v_count FROM public.workspace_members WHERE workspace_id = v_ws_id AND member_id = '11111111-1111-1111-1111-111111111111' AND role_name = 'workspace_admin';
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: caller not workspace_admin'; END IF;
  v_assert_count := v_assert_count + 1;
  RAISE NOTICE 'OK %: core workspace + workspace_admin membership created', v_assert_count;

  -- project + project_membership
  SELECT count(*) INTO v_count FROM public.projects WHERE id = v_prj_id AND workspace_id = v_ws_id AND identifier = 'main';
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: project row mismatch'; END IF;
  SELECT count(*) INTO v_count FROM public.project_members WHERE project_id = v_prj_id AND member_id = '11111111-1111-1111-1111-111111111111' AND role_name = 'project_owner';
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: caller not project_owner'; END IF;
  v_assert_count := v_assert_count + 1;
  RAISE NOTICE 'OK %: main project + project_owner membership created', v_assert_count;

  -- persons row updated to point at the new hierarchy
  SELECT count(*) INTO v_count FROM public.persons
    WHERE id = '11111111-1111-1111-1111-111111111111'
      AND active_organization_id = v_org_id AND active_workspace_id = v_ws_id AND active_project_id = v_prj_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: persons.active_* not updated'; END IF;
  v_assert_count := v_assert_count + 1;
  RAISE NOTICE 'OK %: caller persons.active_* pointers updated', v_assert_count;

  -- -------------------------------------------------------------------------
  -- 3. Anonymous caller (auth.uid() NULL) is denied.
  -- -------------------------------------------------------------------------
  SET ROLE authenticated;
  SET request.jwt.claims = '{"role":"authenticated"}';  -- no sub -> auth.uid() NULL
  BEGIN
    PERFORM public.create_organization_hierarchy('Anon Org', 'anon-org');
    RAISE EXCEPTION 'ASSERTION FAILED: anonymous call should have been denied';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert_count := v_assert_count + 1;
    RAISE NOTICE 'OK %: anonymous caller denied (auth.uid() NULL -> 42501)', v_assert_count;
  END;
  RESET ROLE;

  -- -------------------------------------------------------------------------
  -- 4. Invalid identifier slug is rejected.
  -- -------------------------------------------------------------------------
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  BEGIN
    PERFORM public.create_organization_hierarchy('Bad Slug Org', 'Invalid Slug!!');
    RAISE EXCEPTION 'ASSERTION FAILED: invalid slug should have been rejected';
  EXCEPTION WHEN invalid_parameter_value THEN
    v_assert_count := v_assert_count + 1;
    RAISE NOTICE 'OK %: invalid identifier slug rejected', v_assert_count;
  END;
  RESET ROLE;

  -- -------------------------------------------------------------------------
  -- 5. Empty name is rejected.
  -- -------------------------------------------------------------------------
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  BEGIN
    PERFORM public.create_organization_hierarchy('   ', 'valid-slug-2');
    RAISE EXCEPTION 'ASSERTION FAILED: empty name should have been rejected';
  EXCEPTION WHEN invalid_parameter_value THEN
    v_assert_count := v_assert_count + 1;
    RAISE NOTICE 'OK %: empty organization name rejected', v_assert_count;
  END;
  RESET ROLE;

  -- -------------------------------------------------------------------------
  -- 6. A second caller gets an independent hierarchy (no cross-contamination).
  -- -------------------------------------------------------------------------
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  SELECT public.create_organization_hierarchy('Beta LLC', 'beta-llc') INTO v_result;
  RESET ROLE;
  SELECT count(*) INTO v_count FROM public.organization_members
    WHERE organization_id = (v_result ->> 'organization_id')::uuid
      AND member_id = '22222222-2222-2222-2222-222222222222' AND role_name = 'org_owner';
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: caller B not owner of own org'; END IF;
  -- caller B must NOT be a member of caller A's org
  SELECT count(*) INTO v_count FROM public.organization_members
    WHERE organization_id = (SELECT id FROM public.organizations WHERE identifier='acme-corp')
      AND member_id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: caller B leaked into caller A org'; END IF;
  v_assert_count := v_assert_count + 1;
  RAISE NOTICE 'OK %: second caller gets an independent hierarchy, no cross-tenant leak', v_assert_count;

  RAISE NOTICE '=== ALL % ASSERTIONS PASSED ===', v_assert_count;
END $$;
