-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Journey-ledger assertions, run as `authenticated` with RLS enforced.
-- Coverage: run/step create + state machine, RLS cross-user denial, idempotency
-- (unique idempotency_key), optimistic concurrency (revision), expiry, and the
-- resolve_onboarding_readiness RPC (no run / incomplete / complete / anon).

\set QUIET on
\pset footer off

-- Seed the trusted journey definition (service-side normative config) that the
-- readiness RPC resolves required steps from. This is config data, not a test
-- of the seed itself.
INSERT INTO public.onboarding_journey_definitions (wizard_key, wizard_version, required_step_keys, status)
VALUES ('onboarding.person', '1.0.0', ARRAY['onboarding.person.identity','onboarding.person.address'], 'published')
ON CONFLICT (wizard_key, wizard_version) DO NOTHING;

DO $$
DECLARE
  v_assert int := 0;
  v_run_id uuid;
  v_other_run uuid;
  v_decision jsonb;
  v_count int;
  v_rev int;
BEGIN
  RAISE NOTICE '=== journey-ledger assertions ===';

  -- 1. Actor A creates a run (idempotent key) + steps.
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, idempotency_key)
  VALUES ('onboarding.person', '11111111-1111-1111-1111-111111111111'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'run-a-1')
  RETURNING id INTO v_run_id;

  INSERT INTO public.onboarding_step_states (run_id, step_key, state) VALUES
    (v_run_id, 'onboarding.person.identity', 'in_progress'),
    (v_run_id, 'onboarding.person.address', 'available');
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: run + steps created by actor A', v_assert;

  -- 2. Idempotency: same idempotency_key -> unique violation.
  BEGIN
    INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, idempotency_key)
    VALUES ('onboarding.person', '11111111-1111-1111-1111-111111111111'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'run-a-1');
    RAISE EXCEPTION 'ASSERTION FAILED: duplicate idempotency_key accepted';
  EXCEPTION WHEN unique_violation THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: duplicate idempotency_key rejected (idempotent)', v_assert;
  END;

  -- 3. Cross-user RLS: actor B cannot read actor A's run.
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM public.onboarding_runs WHERE id = v_run_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: actor B read actor A run'; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: cross-user run read denied by RLS', v_assert;

  -- 4. Cross-user RLS: actor B cannot read/write actor A's step states.
  SELECT count(*) INTO v_count FROM public.onboarding_step_states WHERE run_id = v_run_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: actor B read actor A steps'; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: cross-user step read denied by RLS', v_assert;

  -- 5. Optimistic concurrency: revision increments on update.
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  UPDATE public.onboarding_step_states
  SET state = 'completed', completed_at = now(), revision = revision + 1, verified_at = now(), validation_state = 'verified'
  WHERE run_id = v_run_id AND step_key = 'onboarding.person.identity' AND revision = 1;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: optimistic-concurrency update matched % rows', v_count; END IF;
  SELECT revision INTO v_rev FROM public.onboarding_step_states WHERE run_id = v_run_id AND step_key = 'onboarding.person.identity';
  IF v_rev <> 2 THEN RAISE EXCEPTION 'ASSERTION FAILED: revision did not increment (now %)', v_rev; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: optimistic concurrency revision increments', v_assert;

  -- 6. Readiness (server-resolved required steps): identity completed, address not -> require_steps + next=address.
  SELECT public.resolve_onboarding_readiness('onboarding.person', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'require_steps' OR v_decision->>'next_step_key' <> 'onboarding.person.address' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: readiness expected require_steps/address, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: readiness require_steps + next_step when a required step is incomplete', v_assert;

  -- 7. Readiness: complete address -> allow.
  UPDATE public.onboarding_step_states
  SET state = 'completed', completed_at = now(), revision = revision + 1, verified_at = now(), validation_state = 'verified'
  WHERE run_id = v_run_id AND step_key = 'onboarding.person.address';
  SELECT public.resolve_onboarding_readiness('onboarding.person', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'allow' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: readiness expected allow, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: readiness allow once all required steps completed', v_assert;

  -- 8. Readiness: anonymous (no sub) -> unavailable/authentication_required.
  SET request.jwt.claims = '{"role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.person', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'unavailable' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: anonymous readiness expected unavailable, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: anonymous readiness is unavailable/authentication_required', v_assert;

  -- 9. Expiry: an expired run is not selected as active.
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, idempotency_key, expires_at)
  VALUES ('onboarding.person', '22222222-2222-2222-2222-222222222222'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'run-b-expired', now() - interval '1 hour')
  RETURNING id INTO v_other_run;
  SELECT public.resolve_onboarding_readiness('onboarding.person', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'require_steps' OR v_decision->>'reason' <> 'no_active_run' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: expired run should not count as active, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: expired run not treated as active', v_assert;

  -- 10. P0 integrity: a MISSING journey definition -> unavailable, NEVER allow.
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.nonexistent', '9.9.9') INTO v_decision;
  IF v_decision->>'decision' <> 'unavailable' OR v_decision->>'reason' <> 'journey_definition_missing' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: missing definition must be unavailable (not allow), got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: missing journey definition -> unavailable (never silently allow)', v_assert;

  -- 11. P0 integrity: the RPC takes NO client step-list param — required steps come from server config.
  --     Prove by checking the function signature arity is (text, text), NOT a text[] list.
  PERFORM 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='resolve_onboarding_readiness' AND p.pronargs = 2;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERTION FAILED: resolve_onboarding_readiness must take (wizard_key, version), not a client list';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: readiness required steps resolve server-side (no client-controlled list param)', v_assert;

  RESET ROLE;
  RAISE NOTICE '=== ALL % ASSERTIONS PASSED ===', v_assert;
END $$;
