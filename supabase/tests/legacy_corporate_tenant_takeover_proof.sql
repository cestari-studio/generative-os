-- Copyright IBM Corp. 2026
-- This source code is licensed under the Apache-2.0 license found in the
-- LICENSE file in the root directory of this source tree.
--
-- legacy_corporate_tenant_takeover_proof.sql — the BEFORE evidence for
-- BLK-provisioning-takeover (Directive §7.2): against a faithful behavioral
-- stub of the legacy create_or_update_corporate_tenant (mirroring the real
-- body in 20261018225420, applied by _prereq_rpc_grants.sql with
-- alter_policies=true — the permissive live policy surface), an
-- AUTHENTICATED non-member attacker B SEIZES victim A's organization via the
-- identifier-conflict path while the legacy RPC retains authenticated
-- EXECUTE (the live pre-210000 state).
--
-- Proven takeover consequences (the OPEN risk justifying 20261026210000):
--   P2. B re-provisions with A's identifier -> ALLOWED (the conflict path).
--   P3. A's fiscal/legal data OVERWRITTEN by B's hostile payload.
--   P4. A's legal representative REPLACED with the attacker B.
--   P5. B PROMOTED to org_owner (is_default=true) of A's org.
--   P6. A's original owner membership still present but the org is now
--       attacker-controlled (B is also org_owner + legal representative).
-- Plus the control assertions: the SAME attack via the takeover-safe
-- provision_corporate_tenant is denied (42501), and an anonymous caller is
-- denied at the body level.

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
  RAISE NOTICE '=== LEGACY TAKEOVER PROOF (BEFORE — pre-210000 surface) ===';

  -- =========================================================================
  -- SETUP (P1): A provisions a fresh tenant via the AUTHORIZED safe RPC.
  -- =========================================================================
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  SELECT public.provision_corporate_tenant(
    'Victim Corp','victim-corp','Victim Legal','TAX-A','BR','MICRO',
    NULL,NULL,NULL,'{}','en','Core','Main'
  ) INTO v_result;
  v_a_org := (v_result->>'organization_id')::uuid;
  IF v_a_org IS NULL OR (v_result->>'provisioned')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'SETUP FAILED: A fresh provision did not succeed: %', v_result;
  END IF;
  RAISE NOTICE 'setup: A provisioned victim-corp (org %)', v_a_org;

  -- =========================================================================
  -- P2: B (non-member, authenticated) invokes the LEGACY RPC with A's
  -- identifier. The legacy conflict path treats the conflict as proof of
  -- ownership and RETURNS SUCCESS with A's organization_id — the takeover is
  -- PERMITTED while the legacy RPC retains authenticated EXECUTE.
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  SELECT public.create_or_update_corporate_tenant(
    'Hijack','victim-corp','HIJACKED','TAX-EVIL','US','ENTERPRISE',
    NULL,NULL,NULL,'{}','en','Evil WS','Evil PRJ'
  ) INTO v_result;
  IF (v_result->>'organization_id')::uuid IS DISTINCT FROM v_a_org THEN
    RAISE EXCEPTION 'ASSERTION FAILED (P2): legacy RPC did not return A org id to the attacker: %', v_result;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: P2 legacy conflict path ALLOWED the takeover (returned victim org id to B)', v_assert;

  -- P3: A's fiscal/legal data was OVERWRITTEN by B's hostile payload.
  RESET ROLE;
  PERFORM 1 FROM public.organizations
    WHERE id = v_a_org AND legal_name = 'HIJACKED' AND tax_id = 'TAX-EVIL'
      AND country_code = 'US' AND size_category = 'ENTERPRISE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (P3): A org data was NOT overwritten (takeover proof incomplete)';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: P3 A org fiscal/legal data OVERWRITTEN by the attacker (HIJACKED/TAX-EVIL/US/ENTERPRISE)', v_assert;

  -- P4: A's legal representative was REPLACED with the attacker B.
  PERFORM 1 FROM public.organizations
    WHERE id = v_a_org AND legal_representative_id = v_b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (P4): legal_representative_id was NOT replaced with B (takeover proof incomplete)';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: P4 A legal representative REPLACED with the attacker B', v_assert;

  -- P5: B was PROMOTED to org_owner (is_default=true) of A's org WITHOUT any
  -- prior membership — the privileged-membership consequence of the takeover.
  PERFORM 1 FROM public.organization_members
    WHERE organization_id = v_a_org AND member_id = v_b
      AND role_name = 'org_owner' AND is_default IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED (P5): B was NOT promoted to org_owner of A org (takeover proof incomplete)';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: P5 attacker B PROMOTED to org_owner (is_default=true) of A org', v_assert;

  -- P6: the org is now attacker-controlled (B is legal rep + org_owner) while
  -- A's original membership row coexists — a silent co-ownership hijack, not
  -- an error, so NOTHING in the result signals the takeover to A.
  SELECT count(*) INTO v_count FROM public.organization_members
    WHERE organization_id = v_a_org AND role_name = 'org_owner';
  IF v_count < 2 THEN
    RAISE EXCEPTION 'ASSERTION FAILED (P6): expected A+B co-ownership after takeover, found % owners', v_count;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: P6 org silently co-owned by A and the attacker B (no error surfaced to A)', v_assert;

  -- =========================================================================
  -- CONTROL 1: the SAME attack against the takeover-SAFE successor RPC is
  -- DENIED (42501) — proving the guard (not the schema) is what closes it.
  -- Use a SECOND victim identifier so the legacy-taken-over org does not
  -- interfere.
  -- =========================================================================
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  SELECT public.provision_corporate_tenant('Victim2','victim-2','Victim2 Legal','TAX-2','BR','MICRO',NULL,NULL,NULL,'{}','en','Core','Main')
    INTO v_result;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.provision_corporate_tenant('Hijack2','victim-2','EVIL2','TAX-E2','US','ENTERPRISE',NULL,NULL,NULL,'{}','en','Evil','Evil');
    RAISE EXCEPTION 'ASSERTION FAILED (CONTROL): safe-RPC takeover by B was permitted (must be denied)';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: CONTROL the same attack via provision_corporate_tenant is DENIED (42501)', v_assert;
  END;

  -- CONTROL 2: anonymous caller denied at the legacy body level (auth.uid()
  -- NULL check) even with authenticated-equivalent EXECUTE in this fixture.
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  BEGIN
    PERFORM public.create_or_update_corporate_tenant('Anon Org','anon-org');
    RAISE EXCEPTION 'ASSERTION FAILED (CONTROL 2): anonymous legacy call permitted';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: CONTROL anonymous legacy call denied (42501)', v_assert;
  END;

  RESET ROLE;
  RAISE NOTICE '=== ALL % LEGACY-TAKEOVER-PROOF ASSERTIONS PASSED ===', v_assert;
  RAISE NOTICE '=== CONCLUSION: the legacy authenticated-executable RPC permits a FULL tenant takeover. 20261026210000 (grant-layer restriction) is REQUIRED. ===';
END $$;
