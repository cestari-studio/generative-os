-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- 3 anon-RPC grant assertions (Master Directive §6.2) against 20261026130100:
-- anon is DENIED at the GRANT layer; authenticated (the browser contract) +
-- service_role still work.
--
-- GRANT-layer vs BODY-layer proof: the prereq stubs carry a body-level auth
-- check that raises 'Authentication required.' (SQLSTATE 42501) when auth.uid()
-- IS NULL. After the grant migration, an anon call is rejected by PostgreSQL's
-- GRANT layer with SQLSTATE 42501 AND the message 'permission denied for
-- function <name>' — the body NEVER runs, so the body message is never raised.
-- Both layers share SQLSTATE 42501, so we assert on the MESSAGE TEXT to prove
-- the denial is the grant fix, not the old body rejection.

\set QUIET on
\pset footer off

-- The positive assertions below invoke the legacy stub as authenticated /
-- service_role; the stub writes organization_members (FK to persons/users),
-- so the caller identity must exist. (Pre-behavioral-stub this was a no-op
-- synthetic return; the behavioral stub mirrors the real legacy body.)
INSERT INTO auth.users (id) VALUES ('11111111-1111-1111-1111-111111111111') ON CONFLICT DO NOTHING;
INSERT INTO public.persons (id) VALUES ('11111111-1111-1111-1111-111111111111') ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_assert int := 0;
  v_result jsonb;
  v_state text;
  v_msg text;
BEGIN
  RAISE NOTICE '=== 3 anon-RPC grant assertions (grant-layer vs body-layer proof) ===';

  -- -------------------------------------------------------------------------
  -- NEGATIVE: anon DENIED save_onboarding_progress at the GRANT layer.
  -- The body check would say 'Authentication required.'; the grant layer says
  -- 'permission denied for function save_onboarding_progress'. We require the
  -- latter — proving the body never ran (the grant blocks first).
  -- -------------------------------------------------------------------------
  SET ROLE anon;
  BEGIN
    PERFORM public.save_onboarding_progress('individual', 'BR', 1, '{}'::jsonb, false);
    RAISE EXCEPTION 'ASSERTION FAILED: anon EXECUTE save_onboarding_progress succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_state = '42501' AND v_msg = 'permission denied for function save_onboarding_progress' THEN
      v_assert := v_assert + 1;
      RAISE NOTICE 'OK %: anon DENIED save_onboarding_progress — GRANT layer ("%"), NOT body-layer "Authentication required."', v_assert, v_msg;
    ELSIF v_msg = 'Authentication required.' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: anon denial came from the OLD BODY-layer check ("Authentication required."), not the GRANT layer — the grant fix is not what blocks';
    ELSE
      RAISE EXCEPTION 'ASSERTION FAILED: anon save denial had unexpected SQLSTATE % / msg "%" (expected grant-layer 42501 permission denied for function)', v_state, v_msg;
    END IF;
  END;

  -- -------------------------------------------------------------------------
  -- NEGATIVE: anon DENIED create_or_update_corporate_tenant at the GRANT layer.
  -- -------------------------------------------------------------------------
  BEGIN
    PERFORM public.create_or_update_corporate_tenant('X', 'x', 'X', 't', 'BR', 'MICRO', NULL, NULL, NULL, '{}'::jsonb, 'en', 'W', 'P');
    RAISE EXCEPTION 'ASSERTION FAILED: anon EXECUTE create_or_update_corporate_tenant succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_state = '42501' AND v_msg = 'permission denied for function create_or_update_corporate_tenant' THEN
      v_assert := v_assert + 1;
      RAISE NOTICE 'OK %: anon DENIED create_or_update_corporate_tenant — GRANT layer ("%"), NOT body-layer', v_assert, v_msg;
    ELSIF v_msg = 'Authentication required.' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: anon create denial came from the OLD BODY-layer check, not the GRANT layer';
    ELSE
      RAISE EXCEPTION 'ASSERTION FAILED: anon create denial had unexpected SQLSTATE % / msg "%"', v_state, v_msg;
    END IF;
  END;

  -- -------------------------------------------------------------------------
  -- NEGATIVE: anon DENIED resolve_effective_settings at the GRANT layer.
  -- (This stub has NO body auth check, so any 42501 is unambiguously the grant.)
  -- -------------------------------------------------------------------------
  BEGIN
    PERFORM public.resolve_effective_settings(NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'ASSERTION FAILED: anon EXECUTE resolve_effective_settings succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_state = '42501' AND v_msg = 'permission denied for function resolve_effective_settings' THEN
      v_assert := v_assert + 1;
      RAISE NOTICE 'OK %: anon DENIED resolve_effective_settings — GRANT layer ("%")', v_assert, v_msg;
    ELSE
      RAISE EXCEPTION 'ASSERTION FAILED: anon resolve denial had unexpected SQLSTATE % / msg "%"', v_state, v_msg;
    END IF;
  END;

  -- -------------------------------------------------------------------------
  -- POSITIVE: authenticated ALLOWED save_onboarding_progress (browser contract).
  -- Here the body auth check PASSES (auth.uid() is set), proving the function
  -- still runs end-to-end for the legitimate caller.
  -- -------------------------------------------------------------------------
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  SELECT public.save_onboarding_progress('individual', 'BR', 1, '{}'::jsonb, false) INTO v_result;
  IF (v_result->>'saved')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ASSERTION FAILED: authenticated save failed: %', v_result; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: authenticated EXECUTE save_onboarding_progress succeeds (browser contract, body auth check passes)', v_assert;

  -- -------------------------------------------------------------------------
  -- POSITIVE: authenticated ALLOWED resolve_effective_settings.
  -- -------------------------------------------------------------------------
  SELECT public.resolve_effective_settings(NULL, NULL, NULL, NULL) INTO v_result;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: authenticated EXECUTE resolve_effective_settings succeeds', v_assert;

  -- -------------------------------------------------------------------------
  -- POSITIVE: authenticated ALLOWED create_or_update_corporate_tenant.
  -- (The browser contract: TenantContext calls this as an authenticated user.)
  -- -------------------------------------------------------------------------
  SELECT public.create_or_update_corporate_tenant('X', 'x', 'X', 't', 'BR', 'MICRO', NULL, NULL, NULL, '{}'::jsonb, 'en', 'W', 'P') INTO v_result;
  IF (v_result->>'organization_id') IS NULL THEN RAISE EXCEPTION 'ASSERTION FAILED: authenticated create failed: %', v_result; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: authenticated EXECUTE create_or_update_corporate_tenant succeeds', v_assert;

  -- -------------------------------------------------------------------------
  -- POSITIVE: service_role ALLOWED create_or_update_corporate_tenant.
  -- -------------------------------------------------------------------------
  SET ROLE service_role;
  SELECT public.create_or_update_corporate_tenant('X', 'x', 'X', 't', 'BR', 'MICRO', NULL, NULL, NULL, '{}'::jsonb, 'en', 'W', 'P') INTO v_result;
  IF (v_result->>'organization_id') IS NULL THEN RAISE EXCEPTION 'ASSERTION FAILED: service_role create failed: %', v_result; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: service_role EXECUTE create_or_update_corporate_tenant succeeds', v_assert;

  -- -------------------------------------------------------------------------
  -- POSITIVE: service_role ALLOWED save_onboarding_progress + resolve.
  -- -------------------------------------------------------------------------
  SELECT public.save_onboarding_progress('individual', 'BR', 1, '{}'::jsonb, false) INTO v_result;
  IF (v_result->>'saved')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ASSERTION FAILED: service_role save failed: %', v_result; END IF;
  SELECT public.resolve_effective_settings(NULL, NULL, NULL, NULL) INTO v_result;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: service_role EXECUTE save_onboarding_progress + resolve_effective_settings succeed', v_assert;

  RESET ROLE;
  RAISE NOTICE '=== ALL % ASSERTIONS PASSED ===', v_assert;
END $$;
