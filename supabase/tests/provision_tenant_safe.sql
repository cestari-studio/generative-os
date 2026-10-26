-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Safe-provisioning assertions: DEFECT A (InitPlan bug) fixed by DEFINER;
-- DEFECT B (authenticated takeover) denied by the conflict guard.

\set QUIET on
\pset footer off

DO $$
DECLARE
  v_assert int := 0;
  v_result jsonb;
  v_org_id uuid;
  v_count int;
BEGIN
  RAISE NOTICE '=== safe-provisioning assertions ===';

  -- 0. Baseline: the InitPlan-bugged organizations_insert_policy blocks a DIRECT
  --    org INSERT as authenticated (proves the bug exists in this disposable DB).
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
  BEGIN
    INSERT INTO public.organizations (identifier, name) VALUES ('direct-blocked', 'Direct');
    RAISE EXCEPTION 'ASSERTION FAILED: direct org INSERT should be blocked by the InitPlan bug';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: direct org INSERT blocked by InitPlan RLS bug (DEFECT A reproduced)', v_assert;
  END;
  RESET ROLE;

  -- 1. DEFECT A fixed: the DEFINER RPC provisions a fresh tenant for A despite the bug.
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
  SELECT public.provision_corporate_tenant('Acme Corp','acme-corp','Acme Legal','111','BR','MICRO',NULL,NULL,NULL,'{}','en','Core','Main') INTO v_result;
  v_org_id := (v_result->>'organization_id')::uuid;
  IF v_org_id IS NULL OR (v_result->>'provisioned')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: fresh provision did not succeed: %', v_result;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: DEFINER RPC provisions a fresh tenant for A (bypasses InitPlan bug)', v_assert;

  -- 2. A is org_owner of the new org.
  SELECT count(*) INTO v_count FROM public.organization_members
    WHERE organization_id = v_org_id AND member_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND role_name = 'org_owner';
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: A is not org_owner of the new org'; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: A is org_owner of the fresh org', v_assert;

  -- 3. DEFECT B: user B (non-member) attempts a takeover with A's identifier -> denied, NO promotion, NO data change.
  SET request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';
  BEGIN
    PERFORM public.provision_corporate_tenant('Hijack','acme-corp','HIJACKED','999','US','ENTERPRISE',NULL,NULL,NULL,'{}','en','Evil','Evil');
    RAISE EXCEPTION 'ASSERTION FAILED: takeover by B was permitted (must be denied)';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: takeover by non-admin B denied (42501)', v_assert;
  END;

  -- 3b. B was NOT promoted to owner/admin of A's org.
  SELECT count(*) INTO v_count FROM public.organization_members
    WHERE organization_id = v_org_id AND member_id = 'bbbbbbbb-0000-0000-0000-000000000002' AND role_name IN ('org_owner','org_admin');
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: B was promoted to owner/admin of A org'; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: B is NOT promoted to owner/admin of A org', v_assert;

  -- 3c. A's org data was NOT overwritten by B's attempt. Read back as A (member), not B.
  SET request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
  PERFORM 1 FROM public.organizations WHERE id = v_org_id AND legal_name = 'Acme Legal' AND country_code = 'BR';
  IF NOT FOUND THEN RAISE EXCEPTION 'ASSERTION FAILED: A org data was overwritten by B attempt'; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: A org data intact (not hijacked)', v_assert;

  -- 4. Idempotent read-back: A (admin) calls again with the same identifier -> read-back, no error, no dup.
  SET request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
  SELECT public.provision_corporate_tenant('Acme Corp','acme-corp','Acme Legal','111','BR','MICRO',NULL,NULL,NULL,'{}','en','Core','Main') INTO v_result;
  IF (v_result->>'already_existed')::boolean IS NOT TRUE OR (v_result->>'provisioned')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: admin read-back should be already_existed=true provisioned=false, got %', v_result;
  END IF;
  SELECT count(*) INTO v_count FROM public.organization_members
    WHERE organization_id = v_org_id AND member_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: duplicate membership created for A'; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: admin read-back is idempotent (no error, no duplicate membership)', v_assert;

  -- 5. Anonymous denied.
  SET request.jwt.claims = '{"role":"authenticated"}';
  BEGIN
    PERFORM public.provision_corporate_tenant('Anon Org','anon-org');
    RAISE EXCEPTION 'ASSERTION FAILED: anonymous provision permitted';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: anonymous provision denied', v_assert;
  END;

  RESET ROLE;
  RAISE NOTICE '=== ALL % ASSERTIONS PASSED ===', v_assert;
END $$;
