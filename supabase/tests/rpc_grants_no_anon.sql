-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- 3 anon-RPC grant assertions: anon + PUBLIC can NO LONGER execute;
-- authenticated (the browser contract) + service_role still can.

\set QUIET on
\pset footer off

DO $$
DECLARE
  v_assert int := 0;
  v_result jsonb;
BEGIN
  RAISE NOTICE '=== 3 anon-RPC grant assertions ===';

  -- 1. anon denied: save_onboarding_progress.
  SET ROLE anon;
  BEGIN
    PERFORM public.save_onboarding_progress('individual', 'BR', 1, '{}'::jsonb, false);
    RAISE EXCEPTION 'ASSERTION FAILED: anon EXECUTE save_onboarding_progress succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: anon EXECUTE save_onboarding_progress denied', v_assert;
  END;

  -- 2. anon denied: create_or_update_corporate_tenant.
  BEGIN
    PERFORM public.create_or_update_corporate_tenant('X', 'x', 'X', 't', 'BR', 'MICRO', NULL, NULL, NULL, '{}'::jsonb, 'en', 'W', 'P');
    RAISE EXCEPTION 'ASSERTION FAILED: anon EXECUTE create_or_update_corporate_tenant succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: anon EXECUTE create_or_update_corporate_tenant denied', v_assert;
  END;

  -- 3. anon denied: resolve_effective_settings.
  BEGIN
    PERFORM public.resolve_effective_settings(NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'ASSERTION FAILED: anon EXECUTE resolve_effective_settings succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: anon EXECUTE resolve_effective_settings denied', v_assert;
  END;

  -- 4. authenticated allowed: save_onboarding_progress (browser contract).
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  SELECT public.save_onboarding_progress('individual', 'BR', 1, '{}'::jsonb, false) INTO v_result;
  IF (v_result->>'saved')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ASSERTION FAILED: authenticated save failed: %', v_result; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: authenticated EXECUTE save_onboarding_progress succeeds', v_assert;

  -- 5. authenticated allowed: resolve_effective_settings.
  SELECT public.resolve_effective_settings(NULL, NULL, NULL, NULL) INTO v_result;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: authenticated EXECUTE resolve_effective_settings succeeds', v_assert;

  -- 6. service_role allowed: create_or_update_corporate_tenant.
  SET ROLE service_role;
  SELECT public.create_or_update_corporate_tenant('X', 'x', 'X', 't', 'BR', 'MICRO', NULL, NULL, NULL, '{}'::jsonb, 'en', 'W', 'P') INTO v_result;
  IF (v_result->>'organization_id') IS NULL THEN RAISE EXCEPTION 'ASSERTION FAILED: service_role create failed: %', v_result; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: service_role EXECUTE create_or_update_corporate_tenant succeeds', v_assert;

  RESET ROLE;
  RAISE NOTICE '=== ALL % ASSERTIONS PASSED ===', v_assert;
END $$;
