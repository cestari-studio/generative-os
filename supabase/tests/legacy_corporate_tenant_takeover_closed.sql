-- Copyright IBM Corp. 2026
-- This source code is licensed under the Apache-2.0 license found in the
-- LICENSE file in the root directory of this source tree.
--
-- legacy_corporate_tenant_takeover_closed.sql — the AFTER counterpart to
-- legacy_corporate_tenant_takeover_proof.sql. SAME permissive live policy
-- surface (alter_policies=true) on which the takeover was PROVEN, but with
-- 20261026210000 applied. The identical attacker call that previously seized
-- the victim org must now be DENIED at the GRANT layer (42501), and every
-- takeover consequence must be absent:
--   A1. B's legacy-RPC call is denied 42501 (grant layer, before any body).
--   A2. A's org data intact (no overwrite).
--   A3. legal representative still A (not replaced).
--   A4. B holds NO membership row in A's org (not promoted).
--   A5. exactly one org for the identifier; no partial workspace/project for B.
--   A6. B's persons context NOT bound to A's org.

\set QUIET on
\pset footer off

DO $$
DECLARE
  v_assert int := 0;
  v_result jsonb;
  v_a_org uuid;
  v_count int;
  v_a uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_b uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
BEGIN
  RAISE NOTICE '=== LEGACY TAKEOVER CLOSED (AFTER — 20261026210000 applied) ===';

  -- SETUP: A provisions a fresh tenant via the authorized safe RPC.
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  SELECT public.provision_corporate_tenant(
    'Victim After','victim-after','Victim After Legal','TAX-AA','BR','MICRO',
    NULL,NULL,NULL,'{}','en','Core','Main'
  ) INTO v_result;
  v_a_org := (v_result->>'organization_id')::uuid;
  IF v_a_org IS NULL OR (v_result->>'provisioned')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'SETUP FAILED: A fresh provision did not succeed: %', v_result;
  END IF;
  RAISE NOTICE 'setup: A provisioned victim-after (org %)', v_a_org;

  -- A1. the IDENTICAL attack call that succeeded pre-210000 is now denied.
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.create_or_update_corporate_tenant(
      'Hijack','victim-after','HIJACKED','TAX-EVIL','US','ENTERPRISE',
      NULL,NULL,NULL,'{}','en','Evil WS','Evil PRJ'
    );
    RAISE EXCEPTION 'ASSERTION FAILED (A1): the pre-210000 takeover call is STILL permitted after 210000';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: A1 the pre-210000 takeover call is DENIED 42501 at the grant layer', v_assert;
  END;

  -- A2..A5: no takeover consequence landed (privileged reads).
  RESET ROLE;
  PERFORM 1 FROM public.organizations
    WHERE id = v_a_org AND legal_name = 'Victim After Legal' AND tax_id = 'TAX-AA'
      AND country_code = 'BR' AND size_category = 'MICRO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (A2): A org data was overwritten even after 210000';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: A2 A org data intact after the denied call', v_assert;

  PERFORM 1 FROM public.organizations
    WHERE id = v_a_org AND legal_representative_id = v_a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (A3): legal representative replaced even after 210000';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: A3 legal representative still A', v_assert;

  SELECT count(*) INTO v_count FROM public.organization_members
    WHERE organization_id = v_a_org AND member_id = v_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (A4): B holds a membership row in A org after 210000';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: A4 B holds NO membership row in A org', v_assert;

  SELECT count(*) INTO v_count FROM public.organizations WHERE identifier = 'victim-after';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (A5): expected exactly 1 org for victim-after, found %', v_count;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: A5 exactly one org for the identifier (no partial provisioning)', v_assert;

  PERFORM 1 FROM public.persons
    WHERE id = v_b AND (active_organization_id = v_a_org OR works_for_id = v_a_org);
  IF FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (A6): B persons context bound to A org after 210000';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: A6 B persons context NOT bound to A org', v_assert;

  RAISE NOTICE '=== ALL % TAKEOVER-CLOSED ASSERTIONS PASSED ===', v_assert;
  RAISE NOTICE '=== CONCLUSION: on the SAME permissive surface where the takeover succeeded, 20261026210000 closes it at the grant layer. ===';
END $$;
