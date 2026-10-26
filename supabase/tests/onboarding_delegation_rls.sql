-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Onboarding actor/subject delegation assertions, run as `authenticated` with
-- RLS enforced. Covers the Master Directive §4 identity/delegation tests that
-- pertain to persistence/RLS:
--   * self_service (actor==subject): subject writes own run+steps; a DIFFERENT
--     user's run is unreadable/unwritable.
--   * delegated UNAUTHORIZED: a non-actor subject with no delegation cannot
--     write steps on a delegated run.
--   * delegated AUTHORIZED: a delegate WITH an active delegation for a step_key
--     completes it (completed_by=delegate, completion_type='delegated_authorized').
--   * delegate CANNOT complete a step reserved for the subject (step_type
--     'subject' via can_complete_step).
--   * third unrelated user: cannot read/write the run.
--   * idempotency scope: same idempotency_key by DIFFERENT actors allowed;
--     same key+actor is a unique violation.
--   * completed_by is server-derived: a client-supplied completed_by is
--     overwritten by the attribution trigger.
--   * completed_by reflects the effective principal (auth.uid()), not an
--     arbitrary client value.

\set QUIET on
\pset footer off

-- Seed the trusted journey definition the readiness RPC resolves from (config).
INSERT INTO public.onboarding_journey_definitions (wizard_key, wizard_version, required_step_keys, status)
VALUES ('onboarding.person', '1.0.0', ARRAY['onboarding.person.identity','onboarding.person.address'], 'published')
ON CONFLICT (wizard_key, wizard_version) DO NOTHING;

DO $$
DECLARE
  v_assert int := 0;
  v_run_ss uuid;      -- self_service run (subject == actor)
  v_run_del uuid;     -- delegated run (subject=1111, actor=2222)
  v_run_b uuid;       -- a second actor's run for idempotency-scope tests
  v_step record;
  v_count int;
  v_cb uuid;
  v_ct text;
BEGIN
  RAISE NOTICE '=== onboarding-delegation assertions ===';

  -- =========================================================================
  -- self_service run: subject == actor == 1111
  -- =========================================================================
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, idempotency_key)
  VALUES ('onboarding.person', '11111111-1111-1111-1111-111111111111'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'ss-run-1')
  RETURNING id INTO v_run_ss;

  INSERT INTO public.onboarding_step_states (run_id, step_key, state) VALUES
    (v_run_ss, 'onboarding.person.identity', 'in_progress'),
    (v_run_ss, 'onboarding.person.address', 'available');
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [1] self_service subject (actor==subject) creates own run + steps', v_assert;

  -- The subject completes their own step; attribution trigger derives it.
  UPDATE public.onboarding_step_states
  SET state = 'completed', revision = revision + 1
  WHERE run_id = v_run_ss AND step_key = 'onboarding.person.identity';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: self_service subject could not complete own step'; END IF;
  SELECT completed_by, completion_type INTO v_cb, v_ct
  FROM public.onboarding_step_states WHERE run_id = v_run_ss AND step_key = 'onboarding.person.identity';
  IF v_cb <> '11111111-1111-1111-1111-111111111111'::uuid OR v_ct <> 'subject' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: self_service attribution expected subject/1111, got completed_by=% type=%', v_cb, v_ct;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [1b] self_service subject completes own step (completed_by=subject, type=subject)', v_assert;

  -- A DIFFERENT user (stranger 3333) cannot read the self_service run.
  SET request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM public.onboarding_runs WHERE id = v_run_ss;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: stranger read self_service run'; END IF;
  SELECT count(*) INTO v_count FROM public.onboarding_step_states WHERE run_id = v_run_ss;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: stranger read self_service steps'; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [7] third unrelated user cannot read the run or its steps', v_assert;

  -- A DIFFERENT user cannot write steps on the self_service run (INSERT blocked).
  BEGIN
    INSERT INTO public.onboarding_step_states (run_id, step_key, state)
    VALUES (v_run_ss, 'onboarding.person.address', 'completed');
    RAISE EXCEPTION 'ASSERTION FAILED: stranger inserted a step into self_service run';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: [2] non-subject cannot write steps on a self_service run (INSERT denied)', v_assert;
  END;

  -- A DIFFERENT user cannot UPDATE a step on the self_service run to completed.
  -- (RLS USING hides the row, so UPDATE matches 0 rows — a silent no-op, which
  -- is the correct deny-by-invisibility behaviour for UPDATE.)
  UPDATE public.onboarding_step_states
  SET state = 'completed' WHERE run_id = v_run_ss AND step_key = 'onboarding.person.address';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: stranger updated a self_service step'; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [2b] non-subject UPDATE on self_service step matches 0 rows (denied by RLS)', v_assert;

  -- =========================================================================
  -- delegated run: subject=1111, actor(delegate)=2222
  -- =========================================================================
  -- The run's actor creates the delegated run. The actor IS allowed to create
  -- the run row (actor OR subject write on the run table).
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, idempotency_key)
  VALUES ('onboarding.person', '22222222-2222-2222-2222-222222222222'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'del-run-1')
  RETURNING id INTO v_run_del;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [setup] delegated run created (subject=1111, actor/delegate=2222)', v_assert;

  -- delegated UNAUTHORIZED: the delegate (actor) tries to complete a step with
  -- NO delegation in place -> denied by can_complete_step.
  BEGIN
    INSERT INTO public.onboarding_step_states (run_id, step_key, state)
    VALUES (v_run_del, 'onboarding.person.identity', 'completed');
    RAISE EXCEPTION 'ASSERTION FAILED: unauthorized delegate completed a step with no delegation';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: [3] delegate WITHOUT delegation cannot complete a delegated-run step', v_assert;
  END;

  -- delegated AUTHORIZED: grant the delegate an active delegation for
  -- 'onboarding.person.address' (managed by the run's actor). Then the delegate
  -- completes THAT step (completed_by=delegate, type=delegated_authorized).
  INSERT INTO public.onboarding_delegations (run_id, actor_id, subject_user_id, allowed_step_keys, granted_by, status)
  VALUES (v_run_del, '22222222-2222-2222-2222-222222222222'::uuid, '11111111-1111-1111-1111-111111111111'::uuid,
          ARRAY['onboarding.person.address'], '11111111-1111-1111-1111-111111111111'::uuid, 'active');
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [setup] run actor granted delegate an active delegation for address step', v_assert;

  -- The delegate completes the AUTHORIZED step.
  INSERT INTO public.onboarding_step_states (run_id, step_key, state)
  VALUES (v_run_del, 'onboarding.person.address', 'completed');
  SELECT completed_by, completion_type INTO v_cb, v_ct
  FROM public.onboarding_step_states WHERE run_id = v_run_del AND step_key = 'onboarding.person.address';
  IF v_cb <> '22222222-2222-2222-2222-222222222222'::uuid OR v_ct <> 'delegated_authorized' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: delegated attribution expected delegate/2222 + delegated_authorized, got completed_by=% type=%', v_cb, v_ct;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [4] delegate WITH active delegation completes the authorized step (type=delegated_authorized)', v_assert;

  -- The delegate CANNOT complete a step they were NOT delegated
  -- ('onboarding.person.identity' is not in allowed_step_keys).
  BEGIN
    INSERT INTO public.onboarding_step_states (run_id, step_key, state)
    VALUES (v_run_del, 'onboarding.person.identity', 'completed');
    RAISE EXCEPTION 'ASSERTION FAILED: delegate completed a step outside their delegation scope';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: [4b] delegate cannot complete a step outside allowed_step_keys', v_assert;
  END;

  -- delegate CANNOT complete a step RESERVED for the subject
  -- (can_complete_step with p_step_type='subject' returns false for a delegate,
  -- even when the step IS in their delegation). Proven at the helper level.
  IF (SELECT app_private.can_complete_step(v_run_del, 'onboarding.person.address', 'subject')) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: delegate allowed to complete a subject-reserved step';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [5] can_complete_step denies a delegate for a subject-reserved step (p_step_type=subject)', v_assert;

  -- The subject THEMSELVES can always complete their own steps on the
  -- delegated run (the subject is never blocked by the delegation policy).
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  INSERT INTO public.onboarding_step_states (run_id, step_key, state)
  VALUES (v_run_del, 'onboarding.person.identity', 'completed');
  SELECT completed_by, completion_type INTO v_cb, v_ct
  FROM public.onboarding_step_states WHERE run_id = v_run_del AND step_key = 'onboarding.person.identity';
  IF v_cb <> '11111111-1111-1111-1111-111111111111'::uuid OR v_ct <> 'subject' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: subject-on-delegated-run attribution expected subject/1111, got completed_by=% type=%', v_cb, v_ct;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [6] subject can still complete own steps on a delegated run (type=subject)', v_assert;

  -- The subject can READ their own delegations (visibility), and the delegate
  -- can read the delegation that names them.
  SELECT count(*) INTO v_count FROM public.onboarding_delegations WHERE run_id = v_run_del;
  IF v_count < 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: subject could not read own delegation'; END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [8b] subject can read their own delegation rows', v_assert;

  -- =========================================================================
  -- Idempotency scoping (§3.2): composite UNIQUE(actor_id, wizard_key, key)
  -- =========================================================================
  -- Same idempotency_key by a DIFFERENT actor is ALLOWED (no global collision).
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, idempotency_key)
  VALUES ('onboarding.person', '22222222-2222-2222-2222-222222222222'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'ss-run-1')
  RETURNING id INTO v_run_b;
  IF v_run_b IS NULL OR v_run_b = v_run_ss THEN
    RAISE EXCEPTION 'ASSERTION FAILED: cross-actor same-key run collided with the original';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [14] same idempotency_key by a DIFFERENT actor is allowed (composite scope)', v_assert;

  -- Same key + SAME actor is a unique violation (idempotent re-submit).
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  BEGIN
    INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, idempotency_key)
    VALUES ('onboarding.person', '11111111-1111-1111-1111-111111111111'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'ss-run-1');
    RAISE EXCEPTION 'ASSERTION FAILED: duplicate (actor,wizard,idempotency_key) accepted';
  EXCEPTION WHEN unique_violation THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: [14b] same (actor,wizard,idempotency_key) is a unique violation', v_assert;
  END;

  -- The SAME actor may reuse the same key for a DIFFERENT wizard_key.
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, idempotency_key)
  VALUES ('onboarding.company', '11111111-1111-1111-1111-111111111111'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'ss-run-1');
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [14c] same actor + same key + different wizard_key is allowed (composite scope)', v_assert;

  -- =========================================================================
  -- completed_by is SERVER-DERIVED (§3.1): a client-supplied value is ignored.
  -- =========================================================================
  -- The client (actor 2222 on their own self-service run) tries to pre-set
  -- completed_by to a DIFFERENT user on completion; the attribution trigger
  -- must overwrite it with auth.uid().
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  INSERT INTO public.onboarding_step_states (run_id, step_key, state, completed_by, completion_type)
  VALUES (v_run_b, 'onboarding.person.identity', 'in_progress', NULL, NULL);
  UPDATE public.onboarding_step_states
  SET state = 'completed', completed_by = '33333333-3333-3333-3333-333333333333'::uuid, completion_type = 'subject', revision = revision + 1
  WHERE run_id = v_run_b AND step_key = 'onboarding.person.identity';
  SELECT completed_by INTO v_cb
  FROM public.onboarding_step_states WHERE run_id = v_run_b AND step_key = 'onboarding.person.identity';
  IF v_cb <> '22222222-2222-2222-2222-222222222222'::uuid THEN
    RAISE EXCEPTION 'ASSERTION FAILED: client-supplied completed_by was NOT overwritten (got %, expected 2222 effective principal)', v_cb;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [9] client-supplied completed_by is overwritten with the effective principal', v_assert;

  -- completed_by reflects the EFFECTIVE principal (auth.uid()), not an
  -- arbitrary client value — the trigger never trusts NEW.completed_by.
  IF v_cb = '33333333-3333-3333-3333-333333333333'::uuid THEN
    RAISE EXCEPTION 'ASSERTION FAILED: completed_by reflects an arbitrary client value';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [9b] completed_by reflects auth.uid(), never an arbitrary client value', v_assert;

  -- completion_type cannot be forged by the client either (it is derived).
  SELECT completion_type INTO v_ct
  FROM public.onboarding_step_states WHERE run_id = v_run_b AND step_key = 'onboarding.person.identity';
  IF v_ct <> 'subject' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: completion_type was client-forged (got %, expected derived subject)', v_ct;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [9c] completion_type is server-derived (client value ignored)', v_assert;

  -- =========================================================================
  -- Delegation management RLS: only the run's actor manages delegations.
  -- =========================================================================
  -- The STRANGER cannot insert a delegation on someone else's run.
  SET request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
  BEGIN
    INSERT INTO public.onboarding_delegations (run_id, actor_id, subject_user_id, allowed_step_keys, status)
    VALUES (v_run_del, '33333333-3333-3333-3333-333333333333'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, ARRAY['onboarding.person.address'], 'active');
    RAISE EXCEPTION 'ASSERTION FAILED: stranger inserted a delegation on another user run';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: [mgmt] only the run actor may create delegations (stranger denied)', v_assert;
  END;

  -- An EXPIRED delegation does NOT authorize the delegate.
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  UPDATE public.onboarding_delegations
  SET status = 'active', expires_at = now() - interval '1 hour'
  WHERE run_id = v_run_del AND actor_id = '22222222-2222-2222-2222-222222222222'::uuid;
  IF (SELECT app_private.can_complete_step(v_run_del, 'onboarding.person.address', NULL)) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: expired delegation still authorized the delegate';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [17] an expired delegation no longer authorizes step completion', v_assert;

  -- A REVOKED delegation does NOT authorize the delegate.
  UPDATE public.onboarding_delegations
  SET status = 'revoked', expires_at = NULL
  WHERE run_id = v_run_del AND actor_id = '22222222-2222-2222-2222-222222222222'::uuid;
  IF (SELECT app_private.can_complete_step(v_run_del, 'onboarding.person.address', NULL)) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: revoked delegation still authorized the delegate';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: [mgmt] a revoked delegation no longer authorizes step completion', v_assert;

  RESET ROLE;
  RAISE NOTICE '=== ALL % ASSERTIONS PASSED ===', v_assert;
END $$;
