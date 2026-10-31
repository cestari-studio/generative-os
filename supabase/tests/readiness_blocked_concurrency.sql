-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Readiness `blocked` decision + 'onboarding.tenant' definition assertions,
-- run as `authenticated` with RLS enforced, after BOTH journey-ledger
-- migrations (20261026120000 + 20261026170000) are applied.
--
-- Coverage:
--   blocked taxonomy — run_blocked / run_state_blocked / policy_denied each
--     return decision='blocked', are DISTINCT from allow/require_steps/unavailable,
--     and are NEVER coerced to allow;
--   blocked is returned WITHOUT next_step_key / incomplete_steps (route gate must
--     not open the onboarding flow);
--   'onboarding.tenant' definition — published + non-empty, resolves server-side;
--   definition semantics — absent / invalid-version / empty-definition all
--     unavailable, NEVER allow (CHECK + defensive guard verified for the new key);
--   single-session optimistic concurrency — a stale-revision UPDATE matches 0
--     rows (the REAL two-session race is scripts/test-readiness-concurrency-race.sh).

\set QUIET on
\pset footer off

DO $$
DECLARE
  v_assert int := 0;
  v_run_id uuid;
  v_decision jsonb;
  v_count int;
  v_rev int;
  v_uid1 uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_uid2 uuid := '22222222-2222-2222-2222-222222222222'::uuid;
BEGIN
  RAISE NOTICE '=== readiness blocked + onboarding.tenant assertions ===';

  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

  -- 1. The seeded 'onboarding.tenant' definition is published + non-empty and the
  --    RPC resolves it: no run yet -> require_steps naming the first required step.
  SELECT public.resolve_onboarding_readiness('onboarding.tenant', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'require_steps'
     OR v_decision->>'reason' <> 'no_active_run'
     OR v_decision->>'next_step_key' <> 'onboarding.tenant.identity' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: onboarding.tenant (no run) expected require_steps/no_active_run/identity, got %', v_decision;
  END IF;
  IF jsonb_array_length(v_decision->'required_steps') <> 3 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: onboarding.tenant expected 3 required steps, got %', v_decision->'required_steps';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: onboarding.tenant published definition resolves to require_steps with non-empty required list', v_assert;

  -- 2. An actor with an ACTIVE onboarding.tenant run with all required steps
  --    completed -> allow (proves the seeded definition drives allow, not a mock).
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, idempotency_key)
  VALUES ('onboarding.tenant', v_uid1, v_uid1, 'tenant-run-allow') RETURNING id INTO v_run_id;
  INSERT INTO public.onboarding_step_states (run_id, step_key, state, completed_at, verified_at, validation_state) VALUES
    (v_run_id, 'onboarding.tenant.identity', 'completed', now(), now(), 'verified'),
    (v_run_id, 'onboarding.tenant.organization', 'completed', now(), now(), 'verified'),
    (v_run_id, 'onboarding.tenant.workspace', 'completed', now(), now(), 'verified');
  SELECT public.resolve_onboarding_readiness('onboarding.tenant', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'allow' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: completed onboarding.tenant expected allow, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: onboarding.tenant with all required steps completed -> allow', v_assert;

  -- 3. blocked taxonomy — run_blocked: run_state='blocked' -> decision='blocked',
  --    DISTINCT from allow/require_steps/unavailable, NO next_step_key.
  --    (A fresh uid2 run; the blocked state is set service-side, so RESET ROLE to write it.)
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, idempotency_key, created_at)
  VALUES ('onboarding.tenant', v_uid2, v_uid2, 'tenant-run-blocked', now() - interval '2 minutes') RETURNING id INTO v_run_id;
  RESET ROLE;
  UPDATE public.onboarding_runs SET run_state = 'blocked' WHERE id = v_run_id;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.tenant', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'blocked' OR v_decision->>'reason' <> 'run_blocked' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: run_state=blocked expected blocked/run_blocked, got %', v_decision;
  END IF;
  IF v_decision->>'decision' IN ('allow','require_steps','unavailable') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: blocked was coerced to %', v_decision->>'decision';
  END IF;
  IF (v_decision ? 'next_step_key') AND v_decision->>'next_step_key' IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: blocked must not carry next_step_key, got %', v_decision;
  END IF;
  IF jsonb_array_length(v_decision->'incomplete_steps') <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: blocked must not carry incomplete_steps, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: run_state=blocked -> blocked/run_blocked, no next_step, never allow', v_assert;

  -- 4. blocked taxonomy — policy_denied: an ACTIVE run whose policy_snapshot has
  --    an explicit deny verdict -> blocked/policy_denied (not require_steps/allow).
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, idempotency_key, created_at)
  VALUES ('onboarding.tenant', v_uid2, v_uid2, 'tenant-run-policy', now() - interval '1 minute') RETURNING id INTO v_run_id;
  RESET ROLE;
  UPDATE public.onboarding_runs
     SET policy_snapshot = '{"deny": true, "policy": "tenant_country_unsupported"}'::jsonb
   WHERE id = v_run_id;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.tenant', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'blocked' OR v_decision->>'reason' <> 'policy_denied' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: deny policy_snapshot expected blocked/policy_denied, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: policy_snapshot deny verdict -> blocked/policy_denied', v_assert;

  -- 5. blocked taxonomy — run_state_blocked: latest run is 'expired' (terminal,
  --    non-resumable) -> blocked/run_state_blocked, NOT silently restarted as
  --    require_steps/no_active_run.
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, idempotency_key, expires_at, created_at)
  VALUES ('onboarding.tenant', v_uid1, v_uid1, 'tenant-run-terminal', now() - interval '1 hour', now() + interval '1 minute') RETURNING id INTO v_run_id;
  RESET ROLE;
  UPDATE public.onboarding_runs SET run_state = 'expired' WHERE id = v_run_id;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.tenant', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'blocked' OR v_decision->>'reason' <> 'run_state_blocked' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: terminal expired run expected blocked/run_state_blocked, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: latest terminal (expired) run -> blocked/run_state_blocked, not silently restarted', v_assert;

  -- 6. Definition semantics — absent definition (unknown key) -> unavailable /
  --    journey_definition_missing, NEVER allow.
  SELECT public.resolve_onboarding_readiness('onboarding.absent', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'unavailable' OR v_decision->>'reason' <> 'journey_definition_missing' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: absent definition expected unavailable/missing, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: absent definition -> unavailable/journey_definition_missing (never allow)', v_assert;

  -- 7. Definition semantics — INVALID version for the seeded key (a version with no
  --    published definition) -> unavailable, NEVER allow even though the key exists.
  SELECT public.resolve_onboarding_readiness('onboarding.tenant', '9.9.9') INTO v_decision;
  IF v_decision->>'decision' <> 'unavailable' OR v_decision->>'reason' <> 'journey_definition_missing' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: invalid version expected unavailable/missing, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: onboarding.tenant at invalid version -> unavailable (never allow)', v_assert;

  -- 8. Definition semantics — EMPTY required list for the new key cannot be published
  --    (CHECK), and a draft/empty one resolves to unavailable, NEVER allow. Run the
  --    CHECK write as the owner role so it reaches the constraint (RLS would block
  --    authenticated/service_role writes here regardless).
  RESET ROLE;
  BEGIN
    INSERT INTO public.onboarding_journey_definitions (wizard_key, wizard_version, required_step_keys, status)
    VALUES ('onboarding.tenant', '0.0.0-empty', ARRAY[]::text[], 'published');
    RAISE EXCEPTION 'ASSERTION FAILED: published empty required_step_keys accepted for onboarding.tenant (CHECK must reject)';
  EXCEPTION WHEN check_violation THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: published empty required_step_keys for onboarding.tenant rejected by CHECK', v_assert;
  END;
  INSERT INTO public.onboarding_journey_definitions (wizard_key, wizard_version, required_step_keys, status)
  VALUES ('onboarding.tenant', '0.0.0-empty', ARRAY[]::text[], 'draft');
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.tenant', '0.0.0-empty') INTO v_decision;
  IF v_decision->>'decision' <> 'unavailable' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: empty/draft onboarding.tenant definition expected unavailable, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: empty/draft onboarding.tenant definition -> unavailable (never unconditional allow)', v_assert;

  -- 9. Single-session optimistic concurrency sanity: a stale-revision UPDATE matches
  --    0 rows (the REAL two-connection race is scripts/test-readiness-concurrency-race.sh).
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, idempotency_key)
  VALUES ('onboarding.tenant', v_uid1, v_uid1, 'tenant-run-rev') RETURNING id INTO v_run_id;
  INSERT INTO public.onboarding_step_states (run_id, step_key, state) VALUES (v_run_id, 'onboarding.tenant.identity', 'in_progress');
  -- first writer wins at revision 1 -> 2
  UPDATE public.onboarding_step_states
     SET state = 'completed', completed_at = now(), revision = revision + 1, verified_at = now(), validation_state = 'verified'
   WHERE run_id = v_run_id AND step_key = 'onboarding.tenant.identity' AND revision = 1;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: fresh-revision update matched % rows', v_count; END IF;
  -- a STALE writer retrying at revision 1 must match 0 rows (lost-update prevented)
  UPDATE public.onboarding_step_states
     SET state = 'completed', completed_at = now(), revision = revision + 1
   WHERE run_id = v_run_id AND step_key = 'onboarding.tenant.identity' AND revision = 1;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: stale-revision update matched % rows (lost update!)', v_count; END IF;
  SELECT revision INTO v_rev FROM public.onboarding_step_states WHERE run_id = v_run_id AND step_key = 'onboarding.tenant.identity';
  IF v_rev <> 2 THEN RAISE EXCEPTION 'ASSERTION FAILED: revision drifted to % after stale write', v_rev; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: stale-revision UPDATE matches 0 rows; revision stable at 2 (lost update prevented)', v_assert;

  RESET ROLE;
  RAISE NOTICE '=== ALL % READINESS BLOCKED/TENANT ASSERTIONS PASSED ===', v_assert;
END $$;
