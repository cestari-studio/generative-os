-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Readiness ORG-SCOPING assertions (red-team P1), run as `authenticated` with
-- RLS enforced, after the additive migration 20261026190000_readiness_org_scoping.
--
-- THE CORE P1: a completed onboarding run in org A must NOT yield `allow` in
-- org B. This file asserts the fixed contract; the harness first runs the
-- REPRODUCTION against the pre-fix implementation to prove the leak.
--
-- Coverage (owner-specified contract):
--   org A completed run, evaluate in org B  -> NOT allow (the core P1);
--   delegated run (actor<>subject) in A, evaluate in B -> NOT allow;
--   scope='personal' evaluates GLOBALLY (no org context needed);
--   organizational with NO active org context -> unavailable/org_context_missing;
--   organizational with active org the caller is NOT a member of
--                                             -> blocked/org_membership_required;
--   run absent / expired / blocked / completed variants keep their taxonomy;
--   multiple eligible live runs in the same context -> unavailable/ambiguous_runs;
--   NULL target_organization_id is never a wildcard for "any organization";
--   a delegated-actor authorization never silently becomes the subject's
--     personal/org authorization.

\set QUIET on
\pset footer off

DO $$
DECLARE
  v_assert int := 0;
  v_decision jsonb;
  v_scope text;
  v_rows bigint;
  v_run_id uuid;
  v_run_b uuid;
  v_subject uuid := '11111111-1111-1111-1111-111111111111'::uuid;  -- member of A + B
  v_delegate uuid := '22222222-2222-2222-2222-222222222222'::uuid; -- member of A only
  v_outsider uuid := '33333333-3333-3333-3333-333333333333'::uuid; -- member of none
  v_org_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  v_org_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
BEGIN
  RAISE NOTICE '=== readiness org-scoping (P1) assertions ===';

  -- ---------------------------------------------------------------------------
  -- FIXTURE (owner role): two orgs; subject is a member of BOTH A and B;
  -- delegate is a member of A ONLY; outsider is a member of NEITHER.
  -- persons.active_organization_id is the server-trusted pointer the RPC reads.
  -- ---------------------------------------------------------------------------
  RESET ROLE;
  INSERT INTO public.organization_members (organization_id, member_id) VALUES
    (v_org_a, v_subject),
    (v_org_b, v_subject),
    (v_org_a, v_delegate)
  ON CONFLICT DO NOTHING;
  SELECT scope INTO v_scope
    FROM public.onboarding_journey_definitions
   WHERE wizard_key = 'onboarding.tenant' AND wizard_version = '1.0.0';
  IF v_scope IS DISTINCT FROM 'personal' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: owner-decided onboarding.tenant scope expected personal, got %', v_scope;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: onboarding.tenant uses owner-decided personal scope', v_assert;

  -- Keep the cross-organization isolation assertions on an explicitly
  -- organizational fixture. onboarding.tenant is intentionally personal per
  -- the owner decision and must evaluate globally for this user's setup flow.
  INSERT INTO public.onboarding_journey_definitions (wizard_key, wizard_version, required_step_keys, status, scope)
  VALUES (
    'onboarding.org-scoped',
    '1.0.0',
    ARRAY[
      'onboarding.tenant.identity',
      'onboarding.tenant.organization',
      'onboarding.tenant.workspace'
    ],
    'published',
    'organizational'
  )
  ON CONFLICT (wizard_key, wizard_version) DO UPDATE
    SET scope = EXCLUDED.scope,
        required_step_keys = EXCLUDED.required_step_keys;

  -- personal-scope journey definition (service-managed normative config).
  INSERT INTO public.onboarding_journey_definitions (wizard_key, wizard_version, required_step_keys, status, scope)
  VALUES ('onboarding.profile', '1.0.0', ARRAY['onboarding.profile.identity'], 'published', 'personal')
  ON CONFLICT (wizard_key, wizard_version) DO UPDATE SET scope = EXCLUDED.scope, required_step_keys = EXCLUDED.required_step_keys;

  -- Helper to point a user's active org (the sanctioned server-side pointer).
  -- Written as owner to emulate switch_active_context's validated write.

  -- ===========================================================================
  -- 1. CORE P1: subject completes onboarding for org A, then operates in org B.
  --    Evaluating readiness in org B must NOT allow because of A's run.
  -- ===========================================================================
  -- Point subject at org A; create + complete an org-A-scoped run.
  UPDATE public.persons SET active_organization_id = v_org_a WHERE id = v_subject;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, target_organization_id, idempotency_key)
  VALUES ('onboarding.org-scoped', v_subject, v_subject, v_org_a, 'orgA-complete') RETURNING id INTO v_run_id;
  INSERT INTO public.onboarding_step_states (run_id, step_key, state, completed_at, verified_at, validation_state) VALUES
    (v_run_id, 'onboarding.tenant.identity', 'completed', now(), now(), 'verified'),
    (v_run_id, 'onboarding.tenant.organization', 'completed', now(), now(), 'verified'),
    (v_run_id, 'onboarding.tenant.workspace', 'completed', now(), now(), 'verified');
  -- Sanity: in org A context the completed active run DOES allow (positive control).
  SELECT public.resolve_onboarding_readiness('onboarding.org-scoped', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'allow' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: org A context with completed org-A run expected allow, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: org A context, completed org-A run -> allow (positive control)', v_assert;

  -- Switch the subject's active context to org B (as owner, emulating the
  -- membership-validated switch_active_context write) and re-evaluate.
  RESET ROLE;
  UPDATE public.persons SET active_organization_id = v_org_b WHERE id = v_subject;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.org-scoped', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' = 'allow' THEN
    RAISE EXCEPTION 'ASSERTION FAILED (CORE P1): org B context ALLOWED because of org A run -> cross-org leak! %', v_decision;
  END IF;
  IF v_decision->>'decision' <> 'require_steps' OR v_decision->>'reason' <> 'no_active_run' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: org B context expected require_steps/no_active_run (no org-B run), got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: CORE P1 — org B context does NOT allow because of org A run (leak closed)', v_assert;

  -- ===========================================================================
  -- 2. DELEGATED run in org A (actor=delegate, subject=subject): evaluating in
  --    org B must NOT allow. The delegate's org-A authorization never leaks to B.
  -- ===========================================================================
  RESET ROLE;
  UPDATE public.persons SET active_organization_id = v_org_a WHERE id = v_delegate;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, target_organization_id, idempotency_key)
  VALUES ('onboarding.org-scoped', v_delegate, v_subject, v_org_a, 'orgA-delegated') RETURNING id INTO v_run_id;
  -- The SUBJECT completes their own steps in the delegated run (subject always
  -- may per can_complete_step); the delegate has no delegation grant here.
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  INSERT INTO public.onboarding_step_states (run_id, step_key, state, completed_at, verified_at, validation_state) VALUES
    (v_run_id, 'onboarding.tenant.identity', 'completed', now(), now(), 'verified'),
    (v_run_id, 'onboarding.tenant.organization', 'completed', now(), now(), 'verified'),
    (v_run_id, 'onboarding.tenant.workspace', 'completed', now(), now(), 'verified');

  -- The SUBJECT operates in org B: A's delegated run must not allow B.
  RESET ROLE;
  UPDATE public.persons SET active_organization_id = v_org_b WHERE id = v_subject;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.org-scoped', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' = 'allow' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: delegated org-A run leaked allow into org B: %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: delegated org-A run (actor<>subject) does not allow org B', v_assert;

  -- The DELEGATE (member of A only) has no org-B context: point them at B is
  -- impossible (switch_active_context would 42501). Emulate a stale/forged
  -- pointer: active_organization_id = B but delegate is NOT a member of B.
  RESET ROLE;
  UPDATE public.persons SET active_organization_id = v_org_b WHERE id = v_delegate;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.org-scoped', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' = 'allow' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: non-member of org B was allowed: %', v_decision;
  END IF;
  IF v_decision->>'decision' <> 'blocked' OR v_decision->>'reason' <> 'org_membership_required' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: non-member active org expected blocked/org_membership_required, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: active org the caller is NOT a member of -> blocked/org_membership_required (never allow)', v_assert;

  -- ===========================================================================
  -- 3. PERSONAL journey (scope='personal') evaluates GLOBALLY — no org context.
  -- ===========================================================================
  RESET ROLE;
  UPDATE public.persons SET active_organization_id = NULL WHERE id = v_subject;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, target_organization_id, idempotency_key)
  VALUES ('onboarding.profile', v_subject, v_subject, NULL, 'personal-global') RETURNING id INTO v_run_id;
  INSERT INTO public.onboarding_step_states (run_id, step_key, state, completed_at, verified_at, validation_state)
  VALUES (v_run_id, 'onboarding.profile.identity', 'completed', now(), now(), 'verified');
  SELECT public.resolve_onboarding_readiness('onboarding.profile', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'allow' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: personal journey with completed global run expected allow, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: scope=personal evaluates globally (no org context required) -> allow', v_assert;

  -- The tenant flow's personal-scope run remains active after its required
  -- steps are completed because this resolver offers a fresh run for terminal
  -- rows. The authenticated subject writes only minimal self-service states;
  -- attribution and completion timestamps must be derived by database triggers.
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, target_organization_id, idempotency_key)
  VALUES ('onboarding.tenant', v_subject, v_subject, NULL, 'tenant-personal-flow') RETURNING id INTO v_run_id;
  INSERT INTO public.onboarding_step_states (run_id, step_key, state, payload_minimized, validation_state)
  VALUES
    (v_run_id, 'onboarding.tenant.identity', 'completed', '{}'::jsonb, 'unverified'),
    (v_run_id, 'onboarding.tenant.organization', 'completed', '{}'::jsonb, 'unverified'),
    (v_run_id, 'onboarding.tenant.workspace', 'completed', '{}'::jsonb, 'unverified');
  SELECT public.resolve_onboarding_readiness('onboarding.tenant', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'allow' OR (v_decision->>'run_id')::uuid <> v_run_id THEN
    RAISE EXCEPTION 'ASSERTION FAILED: completed personal onboarding.tenant run expected allow, got %', v_decision;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.onboarding_step_states
     WHERE run_id = v_run_id
       AND (completed_by <> v_subject OR completion_type <> 'subject' OR completed_at IS NULL OR payload_minimized <> '{}'::jsonb)
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: tenant flow completion attribution or payload minimization is incorrect';
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: personal tenant onboarding steps yield allow with server attribution and minimized payloads', v_assert;

  -- Deterministic per-attempt idempotency keys serialize concurrent tabs under
  -- the scoped unique index; the client then reads the winning active run.
  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key)
  VALUES (
    'onboarding.tenant',
    '1.0.0',
    v_subject,
    v_subject,
    'tenant-onboarding:' || v_subject::text || ':1.0.0:' || v_run_id::text
  );
  BEGIN
    BEGIN
      INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key)
      VALUES (
        'onboarding.tenant',
        '1.0.0',
        '11111111-1111-1111-1111-111111111111'::uuid,
        '11111111-1111-1111-1111-111111111111'::uuid,
        'tenant-onboarding:11111111-1111-1111-1111-111111111111:1.0.0:' ||
          (SELECT id::text FROM public.onboarding_runs WHERE idempotency_key LIKE 'tenant-personal-flow%')
      );
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END;
  SELECT count(*) INTO v_rows
    FROM public.onboarding_runs
   WHERE actor_id = v_subject
     AND wizard_key = 'onboarding.tenant'
     AND idempotency_key = 'tenant-onboarding:' || v_subject::text || ':1.0.0:' || v_run_id::text;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: deterministic tenant attempt key must yield exactly one run, got %', v_rows;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: same subject + wizard + attempt key cannot create duplicate runs', v_assert;

  -- ===========================================================================
  -- 4. ORGANIZATIONAL journey with NO active org context -> unavailable, never allow.
  -- ===========================================================================
  SELECT public.resolve_onboarding_readiness('onboarding.org-scoped', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'unavailable' OR v_decision->>'reason' <> 'org_context_missing' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: organizational journey with no org context expected unavailable/org_context_missing, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: organizational journey with NULL active org -> unavailable/org_context_missing (never allow)', v_assert;

  -- ===========================================================================
  -- 5. OUTSIDER (member of NEITHER org) points at org A: blocked, never allow.
  --    (A user without membership/authorization in the active context -> blocked.)
  -- ===========================================================================
  RESET ROLE;
  UPDATE public.persons SET active_organization_id = v_org_a WHERE id = v_outsider;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.org-scoped', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'blocked' OR v_decision->>'reason' <> 'org_membership_required' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: outsider with active org A expected blocked/org_membership_required, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: outsider (no membership in active org) -> blocked/org_membership_required', v_assert;

  -- ===========================================================================
  -- 6. RUN VARIANTS in org context. Use a fresh org-C-free subject state: point
  --    subject at org A (member) and exercise blocked/expired taxonomy scoped
  --    to org A. These runs are org-A-targeted so they do not cross contexts.
  -- ===========================================================================
  -- 6a. blocked run in org A -> blocked/run_blocked.
  -- First supersede the subject's earlier ACTIVE org-A runs (from #1/#2) so the
  -- ambiguity guard does not fire: only the #6 variant run stays active.
  RESET ROLE;
  UPDATE public.onboarding_runs SET run_state = 'completed', completed_at = now()
   WHERE idempotency_key IN ('orgA-complete', 'orgA-delegated');
  UPDATE public.persons SET active_organization_id = v_org_a WHERE id = v_subject;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, target_organization_id, idempotency_key, created_at)
  VALUES ('onboarding.org-scoped', v_subject, v_subject, v_org_a, 'orgA-blocked', now() + interval '1 minute') RETURNING id INTO v_run_id;
  RESET ROLE;
  UPDATE public.onboarding_runs SET run_state = 'blocked' WHERE id = v_run_id;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.org-scoped', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'blocked' OR v_decision->>'reason' <> 'run_blocked' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: org-A blocked run expected blocked/run_blocked, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: org-A run_state=blocked -> blocked/run_blocked (taxonomy preserved)', v_assert;

  -- 6b. expired (terminal) latest run in org A -> blocked/run_state_blocked.
  RESET ROLE;
  UPDATE public.onboarding_runs SET run_state = 'expired' WHERE id = v_run_id;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.org-scoped', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'blocked' OR v_decision->>'reason' <> 'run_state_blocked' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: org-A expired run expected blocked/run_state_blocked, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: org-A terminal expired run -> blocked/run_state_blocked (taxonomy preserved)', v_assert;

  -- 6c. a COMPLETED org-A run no longer allows in org A once superseded: it is
  --     not 'active', so the gate offers a fresh run (require_steps). It must
  --     NOT error and must NOT allow a different org.
  RESET ROLE;
  UPDATE public.onboarding_runs SET run_state = 'completed', completed_at = now() WHERE id = v_run_id;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.org-scoped', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' NOT IN ('require_steps') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: org-A completed run expected require_steps (superseded), got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: org-A completed (superseded) run -> require_steps (gate already passed, fresh run)', v_assert;

  -- ===========================================================================
  -- 7. AMBIGUITY: two eligible ACTIVE runs in the SAME org context -> unavailable.
  -- ===========================================================================
  RESET ROLE;
  UPDATE public.persons SET active_organization_id = v_org_b WHERE id = v_subject;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, target_organization_id, idempotency_key, created_at)
  VALUES ('onboarding.org-scoped', v_subject, v_subject, v_org_b, 'orgB-run-1', now() - interval '2 minutes') RETURNING id INTO v_run_id;
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, target_organization_id, idempotency_key, created_at)
  VALUES ('onboarding.org-scoped', v_subject, v_subject, v_org_b, 'orgB-run-2', now() - interval '1 minute') RETURNING id INTO v_run_b;
  SELECT public.resolve_onboarding_readiness('onboarding.org-scoped', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'unavailable' OR v_decision->>'reason' <> 'ambiguous_runs' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: two active runs in org B expected unavailable/ambiguous_runs, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: multiple active runs in same context -> unavailable/ambiguous_runs (no arbitrary pick)', v_assert;

  -- ===========================================================================
  -- 8. NULL target_organization_id is NEVER a wildcard: an organizational
  --    journey in org B must NOT match a NULL-org run.
  -- ===========================================================================
  RESET ROLE;
  DELETE FROM public.onboarding_runs WHERE idempotency_key IN ('orgB-run-1', 'orgB-run-2');
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, target_organization_id, idempotency_key)
  VALUES ('onboarding.org-scoped', v_subject, v_subject, NULL, 'org-null-run') RETURNING id INTO v_run_id;
  INSERT INTO public.onboarding_step_states (run_id, step_key, state, completed_at, verified_at, validation_state) VALUES
    (v_run_id, 'onboarding.tenant.identity', 'completed', now(), now(), 'verified'),
    (v_run_id, 'onboarding.tenant.organization', 'completed', now(), now(), 'verified'),
    (v_run_id, 'onboarding.tenant.workspace', 'completed', now(), now(), 'verified');
  -- Subject is pointed at org B (member). The NULL-org completed run must NOT match.
  SELECT public.resolve_onboarding_readiness('onboarding.org-scoped', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' = 'allow' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: NULL target_organization_id matched org B as a wildcard: %', v_decision;
  END IF;
  IF v_decision->>'decision' <> 'require_steps' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: NULL-org run in org-B context expected require_steps, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: NULL target_organization_id never matches a real org context (no wildcard)', v_assert;

  -- ===========================================================================
  -- 9. A delegated-actor authorization never silently becomes the SUBJECT'S
  --    org authorization. The subject (operating in org B, member) has a
  --    delegated run for org A only. Evaluating in org B must require_steps,
  --    and the subject cannot ride the delegate's org-A completion to allow B.
  --    (Already covered by #2's direction; here the reverse direction: the
  --    DELEGATE in org A must not be authorized by the SUBJECT's org-B standing.)
  -- ===========================================================================
  RESET ROLE;
  UPDATE public.persons SET active_organization_id = v_org_a WHERE id = v_delegate;
  DELETE FROM public.onboarding_runs WHERE idempotency_key = 'org-null-run';
  -- Give the delegate a fresh ACTIVE org-A delegated run with all steps
  -- completed by the subject (the earlier one was superseded in #6a).
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  -- created_at is given an explicit offset: the whole suite runs in ONE
  -- transaction (now() is constant), so without it ORDER BY created_at DESC
  -- ties against the superseded orgA-delegated run and picks the wrong row.
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, target_organization_id, idempotency_key, created_at)
  VALUES ('onboarding.org-scoped', v_delegate, v_subject, v_org_a, 'orgA-delegated-9', now() + interval '2 minutes') RETURNING id INTO v_run_id;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  INSERT INTO public.onboarding_step_states (run_id, step_key, state, completed_at, verified_at, validation_state) VALUES
    (v_run_id, 'onboarding.tenant.identity', 'completed', now(), now(), 'verified'),
    (v_run_id, 'onboarding.tenant.organization', 'completed', now(), now(), 'verified'),
    (v_run_id, 'onboarding.tenant.workspace', 'completed', now(), now(), 'verified');
  -- The DELEGATE evaluates in their own org-A context: it may allow (delegate
  -- IS a member of A). This proves the delegate's org-A authorization is scoped
  -- to A and does not extend the subject's org-B standing (which the delegate
  -- lacks — asserted in #4).
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.org-scoped', '1.0.0') INTO v_decision;
  IF v_decision->>'decision' <> 'allow' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: delegate in own org-A context expected allow, got %', v_decision;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: delegated-actor authorization is scoped to org A (does not become subject''s org-B authorization)', v_assert;

  RESET ROLE;
  RAISE NOTICE '=== ALL % READINESS ORG-SCOPING ASSERTIONS PASSED ===', v_assert;
END $$;
