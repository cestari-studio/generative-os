-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Assertions for 20261026200000_p2_time_state_integrity.sql — one ISOLATED
-- regression block per red-team P2 finding
-- (docs/red-team-audit-provisioning-readiness-cycle.md):
--
--   P2-1  completed_at is server-controlled: a client-supplied value is
--         overwritten on transition INTO completed; immutable while the row
--         stays completed; cleared on regression; onboarding_runs.completed_at
--         is unreachable by a direct authenticated write.
--   P2-2  an expired-but-status='active' delegation corpse no longer blocks
--         re-delegation (auto-swept to 'expired'); a LIVE active conflict still
--         raises 23505; an expired delegation never authorizes a step write.
--   P2-3  expiry/TTL comparisons use wall-clock clock_timestamp(): a
--         delegation or run expiring MID-TRANSACTION stops authorizing /
--         counting immediately, while transaction-frozen now() still sits
--         before the boundary (non-vacuity witnesses included).
--   P2-4  run selection is deterministic (created_at DESC, id DESC —
--         insertion order cannot change the decision) and >1 live ACTIVE
--         eligible run yields unavailable/ambiguous_runs instead of a silent
--         pick; single-run / superseded / expired-corpse semantics preserved.
--
-- Runs as authenticated with RLS enforced on disposable PostgreSQL 17.11.
-- NOTE ON VACUITY: RLS silently filters rows it denies (UPDATE 0, no error),
-- so every denial probe asserts row visibility first and/or verifies the
-- target row's state afterwards — a vacuous no-op must NOT count as "denied".

\echo '=== P2 TIME + STATE-INTEGRITY ASSERTIONS ==='

-- ---------------------------------------------------------------------------
-- Shared setup (migration-owner context): published journey definitions for
-- the isolated readiness scenarios. Each scenario uses its OWN wizard key so
-- no two blocks ever share the caller's run set (the ambiguity rule counts
-- live active runs per (caller, wizard)).
-- ---------------------------------------------------------------------------
-- Worker B's readiness assertions test the DETERMINISM + EXPIRY mechanism
-- (P2-3/P2-4), not org-filtering. The merged resolve_onboarding_readiness is
-- org-scoped (scope defaults to 'organizational', fail-closed), so these
-- synthetic readiness wizards are declared scope='personal' to evaluate the
-- caller's progress GLOBALLY (no org context required) — isolating the
-- mechanism under test. Worker A's org-scoping behavior is covered separately
-- by readiness_org_scoping.sql on 'organizational' journeys.
DO $$
BEGIN
  INSERT INTO public.onboarding_journey_definitions (wizard_key, wizard_version, required_step_keys, status, scope) VALUES
    ('onboarding.p2tiea', '1.0.0', ARRAY['onboarding.p2tiea.one'], 'published', 'personal'),
    ('onboarding.p2tieb', '1.0.0', ARRAY['onboarding.p2tieb.one'], 'published', 'personal'),
    ('onboarding.p2amb',  '1.0.0', ARRAY['onboarding.p2amb.one'],  'published', 'personal'),
    ('onboarding.p2one',  '1.0.0', ARRAY['onboarding.p2one.one', 'onboarding.p2one.two'], 'published', 'personal'),
    ('onboarding.p2exp',  '1.0.0', ARRAY['onboarding.p2exp.one'],  'published', 'personal'),
    ('onboarding.p2sup',  '1.0.0', ARRAY['onboarding.p2sup.one'],  'published', 'personal');
END $$;

-- Temp context table owned by the authenticated role (the probes all run as
-- authenticated), mirroring the P1 suite convention.
SET ROLE authenticated;
CREATE TEMP TABLE p2_ctx (k text PRIMARY KEY, v uuid, t timestamptz);
RESET ROLE;

-- ###########################################################################
-- P2-1 — completed_at is SERVER-CONTROLLED (step + run)
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- Setup: self-service run (actor = subject = 1111) + two step rows.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_subject uuid := '11111111-1111-1111-1111-111111111111';
  v_run uuid;
  v_step uuid;
BEGIN
  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key)
  VALUES ('onboarding.tenant', '1.0.0', v_subject, v_subject, 'p2-1-run')
  RETURNING id INTO v_run;

  INSERT INTO public.onboarding_step_states (run_id, step_key, state)
  VALUES (v_run, 'onboarding.tenant.organization', 'in_progress')
  RETURNING id INTO v_step;

  INSERT INTO p2_ctx (k, v) VALUES ('p2_1_run', v_run), ('p2_1_step', v_step);
  RAISE NOTICE 'setup P2-1: run=% step=%', v_run, v_step;
END $$;

-- ===========================================================================
-- P2-1a. INSERT with state='completed' + completed_at='1970-01-01' is
-- rewritten to the server wall-clock time (the audit's probe 3 negative test).
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_run uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_1_run');
  v_before timestamptz := clock_timestamp();
  v_completed_at timestamptz;
  v_completed_by uuid;
  v_ctype text;
BEGIN
  INSERT INTO public.onboarding_step_states (run_id, step_key, state, completed_at)
  VALUES (v_run, 'onboarding.tenant.identity', 'completed', '1970-01-01 00:00:00+00'::timestamptz)
  RETURNING completed_at, completed_by, completion_type INTO v_completed_at, v_completed_by, v_ctype;

  ASSERT v_completed_at IS NOT NULL AND v_completed_at >= v_before AND v_completed_at <= clock_timestamp(),
    format('P2-1a FAIL: client-supplied 1970 completed_at survived: %s (window %s .. %s)', v_completed_at, v_before, clock_timestamp());
  -- adjacent behavior: attribution still derives the effective principal.
  ASSERT v_completed_by = '11111111-1111-1111-1111-111111111111' AND v_ctype = 'subject',
    format('P2-1a ADJACENT FAIL: completed_by=%s completion_type=%s', v_completed_by, v_ctype);

  RAISE NOTICE 'P2-1a PASS: client-backdated completed_at overwritten with server wall-clock time (%)', v_completed_at;
END $$;

RESET ROLE;

-- ===========================================================================
-- P2-1b. UPDATE transition into completed with a client completed_at is
-- overwritten too.
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_step uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_1_step');
  v_before timestamptz := clock_timestamp();
  v_completed_at timestamptz;
BEGIN
  UPDATE public.onboarding_step_states
     SET state = 'completed', completed_at = '1970-01-01 00:00:00+00'::timestamptz
   WHERE id = v_step
  RETURNING completed_at INTO v_completed_at;

  ASSERT v_completed_at >= v_before AND v_completed_at <= clock_timestamp(),
    format('P2-1b FAIL: UPDATE-transition completed_at not server-stamped: %s', v_completed_at);
  UPDATE p2_ctx SET t = v_completed_at WHERE k = 'p2_1_step';
  RAISE NOTICE 'P2-1b PASS: UPDATE transition into completed stamps server completed_at (%)', v_completed_at;
END $$;

RESET ROLE;

-- ===========================================================================
-- P2-1c. While the row STAYS completed, completed_at is immutable: an UPDATE
-- that keeps state='completed' and tries to rewrite completed_at is ignored.
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_step uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_1_step');
  v_orig timestamptz := (SELECT t FROM p2_ctx WHERE k = 'p2_1_step');
  v_completed_at timestamptz;
BEGIN
  UPDATE public.onboarding_step_states
     SET payload_minimized = '{"note":"still completed"}'::jsonb,
         completed_at = '1970-01-01 00:00:00+00'::timestamptz
   WHERE id = v_step
  RETURNING completed_at INTO v_completed_at;

  ASSERT v_completed_at = v_orig,
    format('P2-1c FAIL: completed_at mutated on a non-transition write: %s -> %s', v_orig, v_completed_at);
  RAISE NOTICE 'P2-1c PASS: completed_at immutable while the step stays completed (client rewrite ignored)';
END $$;

RESET ROLE;

-- ===========================================================================
-- P2-1d. A regression OUT of completed clears completed_at (together with the
-- rest of the attribution, per the pre-existing 150000 behavior).
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_step uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_1_step');
  v_completed_at timestamptz;
  v_completed_by uuid;
BEGIN
  UPDATE public.onboarding_step_states
     SET state = 'in_progress'
   WHERE id = v_step
  RETURNING completed_at, completed_by INTO v_completed_at, v_completed_by;

  ASSERT v_completed_at IS NULL,
    format('P2-1d FAIL: completed_at survived regression to in_progress: %s', v_completed_at);
  ASSERT v_completed_by IS NULL,
    'P2-1d ADJACENT FAIL: completed_by no longer cleared on regression';
  RAISE NOTICE 'P2-1d PASS: regression out of completed clears completed_at (and completed_by)';
END $$;

RESET ROLE;

-- ===========================================================================
-- P2-1e. onboarding_runs.completed_at is unreachable by a direct authenticated
-- UPDATE (it joins the P1-1 server-authoritative guard set).
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_run uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_1_run');
  v_denied boolean := false;
  v_visible int;
BEGIN
  SELECT count(*) INTO v_visible FROM public.onboarding_runs WHERE id = v_run;
  ASSERT v_visible = 1, 'P2-1e SETUP FAIL: subject cannot see the run (probe would be vacuous)';
  BEGIN
    UPDATE public.onboarding_runs SET completed_at = '1970-01-01 00:00:00+00'::timestamptz WHERE id = v_run;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  ASSERT v_denied, 'P2-1e FAIL: authenticated UPDATE of onboarding_runs.completed_at was not blocked';
  RAISE NOTICE 'P2-1e PASS: authenticated cannot UPDATE onboarding_runs.completed_at (42501)';
END $$;

RESET ROLE;

-- Verify the value is still NULL afterwards (non-vacuity: the write did not land).
DO $$
DECLARE
  v_run uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_1_run');
  v_ca timestamptz;
BEGIN
  SELECT completed_at INTO v_ca FROM public.onboarding_runs WHERE id = v_run;
  ASSERT v_ca IS NULL, format('P2-1e VERIFY FAIL: run completed_at was modified to %s', v_ca);
  RAISE NOTICE 'P2-1e VERIFY PASS: run completed_at intact after the erase attempt';
END $$;

-- ===========================================================================
-- P2-1f. Server path: a run_state transition INTO 'completed' stamps
-- completed_at with wall-clock time; a regression OUT clears it. (Adjacent
-- behavior: the P1-1 guard still permits the legitimate server writer.)
-- ===========================================================================
DO $$
DECLARE
  v_run uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_1_run');
  v_before timestamptz := clock_timestamp();
  v_ca timestamptz;
BEGIN
  UPDATE public.onboarding_runs SET run_state = 'completed' WHERE id = v_run
  RETURNING completed_at INTO v_ca;
  ASSERT v_ca IS NOT NULL AND v_ca >= v_before AND v_ca <= clock_timestamp(),
    format('P2-1f FAIL: server transition into completed did not stamp completed_at: %s', v_ca);

  UPDATE public.onboarding_runs SET run_state = 'active' WHERE id = v_run
  RETURNING completed_at INTO v_ca;
  ASSERT v_ca IS NULL,
    format('P2-1f FAIL: server regression out of completed did not clear completed_at: %s', v_ca);

  RAISE NOTICE 'P2-1f PASS: server run_state transition stamps/clears run completed_at (guard still allows the server writer)';
END $$;

-- ===========================================================================
-- P2-1g. A run INSERT with a client-supplied completed_at is normalized from
-- birth: non-completed run -> NULL (never pre-settable).
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_ca timestamptz;
BEGIN
  -- Uses a dedicated wizard key so the run never joins any readiness probe's
  -- run set (ambiguity counts are per (caller, wizard)).
  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key, completed_at)
  VALUES ('onboarding.p2g', '1.0.0', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
          'p2-1g-run', '1970-01-01 00:00:00+00'::timestamptz)
  RETURNING completed_at INTO v_ca;

  ASSERT v_ca IS NULL,
    format('P2-1g FAIL: client pre-set run completed_at survived INSERT: %s', v_ca);
  RAISE NOTICE 'P2-1g PASS: client-supplied run completed_at normalized to NULL on INSERT';
END $$;

RESET ROLE;

-- ###########################################################################
-- P2-2 — expired-delegation corpse no longer blocks re-delegation; an expired
-- delegation never authorizes
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- Setup (owner context): delegated run (actor 2222 = delegate, subject 1111)
-- on the tenant wizard + the organization step row.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_subject uuid := '11111111-1111-1111-1111-111111111111';
  v_delegate uuid := '22222222-2222-2222-2222-222222222222';
  v_run uuid;
  v_step uuid;
BEGIN
  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key)
  VALUES ('onboarding.tenant', '1.0.0', v_delegate, v_subject, 'p2-2-run')
  RETURNING id INTO v_run;

  INSERT INTO public.onboarding_step_states (run_id, step_key, state)
  VALUES (v_run, 'onboarding.tenant.organization', 'in_progress')
  RETURNING id INTO v_step;

  INSERT INTO p2_ctx (k, v) VALUES ('p2_2_run', v_run), ('p2_2_step', v_step)
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
  RAISE NOTICE 'setup P2-2: run=% step=%', v_run, v_step;
END $$;

-- ===========================================================================
-- P2-2 SETUP + P2-2d. The delegate's actor (run manager) grants delegation D1
-- (live, expires in 1h). A SECOND genuinely-live active delegation for the
-- same (run, delegate) must still raise 23505 — the unique constraint is
-- intact (adjacent behavior).
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE
  v_run uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_2_run');
  v_subject uuid := '11111111-1111-1111-1111-111111111111';
  v_delegate uuid := '22222222-2222-2222-2222-222222222222';
  v_d1 uuid;
  v_conflict boolean := false;
BEGIN
  INSERT INTO public.onboarding_delegations (run_id, actor_id, subject_user_id, allowed_step_keys, expires_at, status)
  VALUES (v_run, v_delegate, v_subject, ARRAY['onboarding.tenant.organization'], clock_timestamp() + interval '1 hour', 'active')
  RETURNING id INTO v_d1;
  INSERT INTO p2_ctx (k, v) VALUES ('p2_2_d1', v_d1) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;

  BEGIN
    INSERT INTO public.onboarding_delegations (run_id, actor_id, subject_user_id, allowed_step_keys, expires_at, status)
    VALUES (v_run, v_delegate, v_subject, ARRAY['onboarding.tenant.organization'], clock_timestamp() + interval '2 hours', 'active');
  EXCEPTION WHEN unique_violation THEN
    v_conflict := true;
  END;

  ASSERT v_conflict, 'P2-2d FAIL: second LIVE active delegation for the same (run, delegate) did not raise 23505 — constraint broken';
  RAISE NOTICE 'P2-2d PASS: two genuinely-live active delegations still collide (23505 preserved)';
END $$;

RESET ROLE;

-- Expire D1 server-side (status stays 'active' -> the corpse state).
DO $$
DECLARE
  v_d1 uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_2_d1');
BEGIN
  UPDATE public.onboarding_delegations
     SET expires_at = clock_timestamp() - interval '1 second'
   WHERE id = v_d1;
END $$;

-- ===========================================================================
-- P2-2b. The EXPIRED delegation does not authorize: the helper denies and the
-- row-level write is denied (vigencia revalidated on use).
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE
  v_run uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_2_run');
  v_step uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_2_step');
  v_ok boolean;
  v_denied boolean := false;
  v_visible int;
  v_completed int;
BEGIN
  v_ok := app_private.can_complete_step(v_run, 'onboarding.tenant.organization', NULL);
  ASSERT NOT v_ok, 'P2-2b FAIL: can_complete_step authorized via an expired delegation';

  SELECT count(*) INTO v_visible FROM public.onboarding_step_states WHERE id = v_step;
  ASSERT v_visible = 1, 'P2-2b SETUP FAIL: delegate cannot see the step (probe would be vacuous)';
  BEGIN
    UPDATE public.onboarding_step_states SET state = 'completed' WHERE id = v_step;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_denied := true;
  END;
  SELECT count(*) INTO v_completed FROM public.onboarding_step_states WHERE id = v_step AND state = 'completed';
  ASSERT v_completed = 0,
    'P2-2b FAIL: expired delegation permitted a step completion at the row level';
  RAISE NOTICE 'P2-2b PASS: expired delegation yields no allow and no write (helper=false, row write denied=%)', v_denied;
END $$;

RESET ROLE;

-- ===========================================================================
-- P2-2a. Re-delegation past the corpse: a fresh active delegation for the same
-- (run, delegate) must SUCCEED (the audit's probe-2 negative test); the corpse
-- is auto-flipped to 'expired'.
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE
  v_run uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_2_run');
  v_d1 uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_2_d1');
  v_subject uuid := '11111111-1111-1111-1111-111111111111';
  v_delegate uuid := '22222222-2222-2222-2222-222222222222';
  v_d2 uuid;
  v_corpse_status text;
BEGIN
  INSERT INTO public.onboarding_delegations (run_id, actor_id, subject_user_id, allowed_step_keys, expires_at, status)
  VALUES (v_run, v_delegate, v_subject, ARRAY['onboarding.tenant.organization'], clock_timestamp() + interval '1 hour', 'active')
  RETURNING id INTO v_d2;

  SELECT status INTO v_corpse_status FROM public.onboarding_delegations WHERE id = v_d1;
  ASSERT v_corpse_status = 'expired',
    format('P2-2a FAIL: corpse delegation not swept (status=%s)', v_corpse_status);

  INSERT INTO p2_ctx (k, v) VALUES ('p2_2_d2', v_d2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
  RAISE NOTICE 'P2-2a PASS: re-delegation succeeds past the expired corpse; corpse auto-expired';
END $$;

RESET ROLE;

-- ===========================================================================
-- P2-2c. Adjacent behavior: the FRESH (unexpired) delegation authorizes the
-- delegate's completion with the correct server-derived attribution.
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE
  v_run uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_2_run');
  v_step uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_2_step');
  v_state text;
  v_ctype text;
  v_by uuid;
BEGIN
  ASSERT app_private.can_complete_step(v_run, 'onboarding.tenant.organization', NULL),
    'P2-2c FAIL: fresh delegation does not authorize (can_complete_step=false)';

  UPDATE public.onboarding_step_states SET state = 'completed' WHERE id = v_step
  RETURNING state, completion_type, completed_by INTO v_state, v_ctype, v_by;

  ASSERT v_state = 'completed' AND v_ctype = 'delegated_authorized' AND v_by = '22222222-2222-2222-2222-222222222222',
    format('P2-2c FAIL: completion landed wrong (state=%s type=%s by=%s)', v_state, v_ctype, v_by);
  RAISE NOTICE 'P2-2c PASS: fresh delegation authorizes; completion_type=delegated_authorized, completed_by=delegate';
END $$;

RESET ROLE;

-- ===========================================================================
-- P2-2e. The sweep also covers the UPDATE (re-activation) path: reactivating a
-- revoked delegation while an expired-active corpse exists succeeds, and the
-- corpse is flipped. Uses a fresh run so the unique-index dance is isolated.
-- ===========================================================================
DO $$
DECLARE
  v_run uuid;
  v_step uuid;
BEGIN
  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key)
  VALUES ('onboarding.tenant', '1.0.0', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'p2-2e-run')
  RETURNING id INTO v_run;
  INSERT INTO p2_ctx (k, v) VALUES ('p2_2e_run', v_run) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
END $$;

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE
  v_run uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_2e_run');
  v_subject uuid := '11111111-1111-1111-1111-111111111111';
  v_delegate uuid := '22222222-2222-2222-2222-222222222222';
  v_corpse uuid;
  v_revoked uuid;
  v_corpse_status text;
BEGIN
  -- Born-corpse: inserted directly with a past expiry (status stays 'active').
  INSERT INTO public.onboarding_delegations (run_id, actor_id, subject_user_id, allowed_step_keys, expires_at, status)
  VALUES (v_run, v_delegate, v_subject, ARRAY['onboarding.tenant.organization'], clock_timestamp() - interval '1 second', 'active')
  RETURNING id INTO v_corpse;

  -- A revoked delegation for the same (run, delegate) coexists (index is partial).
  INSERT INTO public.onboarding_delegations (run_id, actor_id, subject_user_id, allowed_step_keys, expires_at, status)
  VALUES (v_run, v_delegate, v_subject, ARRAY['onboarding.tenant.organization'], clock_timestamp() + interval '1 hour', 'revoked')
  RETURNING id INTO v_revoked;

  -- Re-activate the revoked one: the corpse must be swept, not block.
  UPDATE public.onboarding_delegations SET status = 'active' WHERE id = v_revoked;

  SELECT status INTO v_corpse_status FROM public.onboarding_delegations WHERE id = v_corpse;
  ASSERT v_corpse_status = 'expired',
    format('P2-2e FAIL: re-activation did not sweep the corpse (status=%s)', v_corpse_status);
  RAISE NOTICE 'P2-2e PASS: re-activation (UPDATE path) sweeps the expired corpse too';
END $$;

RESET ROLE;

-- ###########################################################################
-- P2-3 — wall-clock expiry/TTL inside long transactions
-- ###########################################################################

-- ===========================================================================
-- P2-3a. A delegation expiring MID-TRANSACTION stops authorizing immediately
-- (clock_timestamp()), even though transaction-frozen now() is still BEFORE
-- the boundary (the non-vacuity witness: with now() the check would pass).
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

BEGIN;

DO $$
DECLARE
  v_run uuid;
  v_exp timestamptz;
  v_ok boolean;
BEGIN
  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key)
  VALUES ('onboarding.tenant', '1.0.0', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'p2-3a-run')
  RETURNING id INTO v_run;

  v_exp := clock_timestamp() + interval '150 milliseconds';
  INSERT INTO public.onboarding_delegations (run_id, actor_id, subject_user_id, allowed_step_keys, expires_at, status)
  VALUES (v_run, '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
          ARRAY['onboarding.tenant.organization'], v_exp, 'active');

  PERFORM pg_sleep(0.25);

  -- Non-vacuity witness: transaction-frozen now() is STILL before the expiry
  -- boundary, so a now()-based check would (wrongly) keep authorizing.
  ASSERT now() < v_exp,
    'P2-3a SETUP FAIL: transaction-frozen now() already past the boundary — sleep ineffective, probe vacuous';
  ASSERT clock_timestamp() > v_exp,
    'P2-3a SETUP FAIL: wall clock has not crossed the boundary — sleep ineffective, probe vacuous';

  v_ok := app_private.can_complete_step(v_run, 'onboarding.tenant.organization', NULL);
  ASSERT NOT v_ok,
    'P2-3a FAIL: delegation expired mid-transaction still authorizes (transaction-frozen clock in use)';
  RAISE NOTICE 'P2-3a PASS: mid-transaction delegation expiry denies immediately (wall-clock), now() witness %s < %s', now(), v_exp;
END $$;

ROLLBACK;

RESET ROLE;

-- ===========================================================================
-- P2-3b. A RUN expiring mid-transaction stops counting as live in readiness
-- (reason no_active_run, NOT the stale run's step resolution / allow).
-- The expired run is COMMITTED so the P2-4 expired-corpse block can reuse it.
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

BEGIN;

DO $$
DECLARE
  v_run uuid;
  v_exp timestamptz;
  v_decision jsonb;
BEGIN
  v_exp := clock_timestamp() + interval '150 milliseconds';
  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key, expires_at)
  VALUES ('onboarding.p2exp', '1.0.0', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'p2-3b-run', v_exp)
  RETURNING id INTO v_run;

  PERFORM pg_sleep(0.25);

  ASSERT now() < v_exp,
    'P2-3b SETUP FAIL: transaction-frozen now() already past the boundary — probe vacuous';
  ASSERT clock_timestamp() > v_exp,
    'P2-3b SETUP FAIL: wall clock has not crossed the boundary — probe vacuous';

  v_decision := public.resolve_onboarding_readiness('onboarding.p2exp', '1.0.0');
  ASSERT v_decision->>'decision' = 'require_steps' AND v_decision->>'reason' = 'no_active_run',
    format('P2-3b FAIL: mid-transaction-expired run still treated as live: %s', v_decision);

  INSERT INTO p2_ctx (k, v) VALUES ('p2_3b_run', v_run) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
  RAISE NOTICE 'P2-3b PASS: mid-transaction run expiry resolves no_active_run (wall-clock), now() witness %s < %s', now(), v_exp;
END $$;

COMMIT;

RESET ROLE;

-- ===========================================================================
-- P2-3c. completed_at stamps are wall-clock PER STATEMENT: two steps completed
-- 200ms apart in ONE transaction carry strictly increasing timestamps (with
-- now() both would equal the transaction-start time). The second stamp must
-- also be later than the transaction's frozen now().
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

BEGIN;

DO $$
DECLARE
  v_run uuid;
  v_a timestamptz;
  v_b timestamptz;
BEGIN
  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key)
  VALUES ('onboarding.tenant', '1.0.0', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'p2-3c-run')
  RETURNING id INTO v_run;

  INSERT INTO public.onboarding_step_states (run_id, step_key, state)
  VALUES (v_run, 'onboarding.tenant.identity', 'completed')
  RETURNING completed_at INTO v_a;

  PERFORM pg_sleep(0.2);

  INSERT INTO public.onboarding_step_states (run_id, step_key, state)
  VALUES (v_run, 'onboarding.tenant.organization', 'completed')
  RETURNING completed_at INTO v_b;

  ASSERT v_b > v_a,
    format('P2-3c FAIL: two completions in one transaction share the stamp (%s vs %s) — transaction-frozen clock', v_a, v_b);
  ASSERT v_b > now(),
    format('P2-3c FAIL: completed_at (%s) is not later than transaction-start now() (%s) — not wall-clock', v_b, now());
  RAISE NOTICE 'P2-3c PASS: completed_at is wall-clock per statement (a=%s < b=%s, b > txn-start now())', v_a, v_b;
END $$;

ROLLBACK;

RESET ROLE;

-- ###########################################################################
-- P2-4 — deterministic run selection + ambiguity rejection
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- Setup (owner context): two tie scenarios with EXPLICIT ids so the id DESC
-- tie-breaker winner is known, both with identical created_at.
--   p2tiea: active run (id aaaa…), inserted FIRST; blocked run (id ffff…),
--           inserted SECOND. ffff… > aaaa… -> the BLOCKED run must win.
--   p2tieb: blocked run (id aaaa…), inserted FIRST; active run (id ffff…),
--           inserted SECOND. ffff… > aaaa… -> the ACTIVE run must win.
-- If insertion order (not the deterministic key) drove the pick, one of the
-- two scenarios would disagree with the id DESC expectation.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_uid uuid := '11111111-1111-1111-1111-111111111111';
  v_t0 timestamptz := '2026-10-26 12:00:00+00';
BEGIN
  -- Scenario A: active first, blocked second; blocked has the larger id.
  INSERT INTO public.onboarding_runs (id, wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key, run_state, created_at)
  VALUES ('aaaaaaaa-0000-4000-8000-00000000000a', 'onboarding.p2tiea', '1.0.0', v_uid, v_uid, 'p2-4-tiea-active', 'active', v_t0);
  INSERT INTO public.onboarding_runs (id, wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key, run_state, created_at)
  VALUES ('ffffffff-0000-4000-8000-00000000000f', 'onboarding.p2tiea', '1.0.0', v_uid, v_uid, 'p2-4-tiea-blocked', 'active', v_t0);
  UPDATE public.onboarding_runs SET run_state = 'blocked' WHERE id = 'ffffffff-0000-4000-8000-00000000000f';

  -- Scenario B: blocked first, active second; active has the larger id.
  INSERT INTO public.onboarding_runs (id, wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key, run_state, created_at)
  VALUES ('aaaaaaaa-0000-4000-8000-00000000000b', 'onboarding.p2tieb', '1.0.0', v_uid, v_uid, 'p2-4-tieb-blocked', 'active', v_t0);
  UPDATE public.onboarding_runs SET run_state = 'blocked' WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000b';
  INSERT INTO public.onboarding_runs (id, wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key, run_state, created_at)
  VALUES ('ffffffff-0000-4000-8000-00000000000e', 'onboarding.p2tieb', '1.0.0', v_uid, v_uid, 'p2-4-tieb-active', 'active', v_t0);

  RAISE NOTICE 'setup P2-4 tie scenarios: identical created_at, opposite insertion orders, opposite id orderings';
END $$;

-- ===========================================================================
-- P2-4a. Tie-break determinism, scenario A: with identical created_at the
-- larger-id (blocked) run is picked even though it was inserted SECOND.
-- Repeated calls are identical.
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_d1 jsonb;
  v_d2 jsonb;
  v_d3 jsonb;
BEGIN
  v_d1 := public.resolve_onboarding_readiness('onboarding.p2tiea', '1.0.0');
  v_d2 := public.resolve_onboarding_readiness('onboarding.p2tiea', '1.0.0');
  v_d3 := public.resolve_onboarding_readiness('onboarding.p2tiea', '1.0.0');

  ASSERT v_d1 = v_d2 AND v_d2 = v_d3,
    format('P2-4a FAIL: repeated resolves disagree: %s / %s / %s', v_d1, v_d2, v_d3);
  ASSERT v_d1->>'decision' = 'blocked' AND v_d1->>'reason' = 'run_blocked'
         AND v_d1->>'run_id' = 'ffffffff-0000-4000-8000-00000000000f',
    format('P2-4a FAIL: expected the id-DESC winner (blocked, ffff…), got %s', v_d1);
  RAISE NOTICE 'P2-4a PASS: identical created_at -> id DESC picks the blocked run deterministically (insertion order irrelevant)';
END $$;

RESET ROLE;

-- ===========================================================================
-- P2-4b. Tie-break determinism, scenario B (mirror): the larger-id (active)
-- run is picked even though it was inserted SECOND and the blocked run FIRST.
-- Proves the decision follows (created_at, id), never insertion order.
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_d1 jsonb;
  v_d2 jsonb;
BEGIN
  v_d1 := public.resolve_onboarding_readiness('onboarding.p2tieb', '1.0.0');
  v_d2 := public.resolve_onboarding_readiness('onboarding.p2tieb', '1.0.0');

  ASSERT v_d1 = v_d2, format('P2-4b FAIL: repeated resolves disagree: %s / %s', v_d1, v_d2);
  ASSERT v_d1->>'decision' = 'require_steps'
         AND v_d1->>'reason' = 'required_steps_incomplete'
         AND v_d1->>'run_id' = 'ffffffff-0000-4000-8000-00000000000e',
    format('P2-4b FAIL: expected the id-DESC winner (active, ffff…) to drive step resolution, got %s', v_d1);
  RAISE NOTICE 'P2-4b PASS: mirror scenario agrees — the decision is a pure function of (created_at, id), not insertion order';
END $$;

RESET ROLE;

-- ===========================================================================
-- P2-4c. Ambiguity rejection: TWO live ACTIVE runs for the same (caller,
-- wizard) -> unavailable/ambiguous_runs, deterministically, instead of
-- silently picking one.
-- ===========================================================================
DO $$
DECLARE
  v_uid uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key, created_at)
  VALUES ('onboarding.p2amb', '1.0.0', v_uid, v_uid, 'p2-4-amb-1', '2026-10-26 12:00:00+00');
  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key, created_at)
  VALUES ('onboarding.p2amb', '1.0.0', v_uid, v_uid, 'p2-4-amb-2', '2026-10-26 12:00:01+00');
END $$;

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_d1 jsonb;
  v_d2 jsonb;
BEGIN
  v_d1 := public.resolve_onboarding_readiness('onboarding.p2amb', '1.0.0');
  v_d2 := public.resolve_onboarding_readiness('onboarding.p2amb', '1.0.0');

  ASSERT v_d1 = v_d2, format('P2-4c FAIL: ambiguous resolves disagree: %s / %s', v_d1, v_d2);
  ASSERT v_d1->>'decision' = 'unavailable' AND v_d1->>'reason' = 'ambiguous_runs',
    format('P2-4c FAIL: two live ACTIVE runs did not yield unavailable/ambiguous_runs: %s', v_d1);
  ASSERT v_d1->>'decision' <> 'allow',
    'P2-4c FAIL: ambiguity collapsed into allow';
  RAISE NOTICE 'P2-4c PASS: >1 live ACTIVE run -> unavailable/ambiguous_runs (fail closed, deterministic)';
END $$;

RESET ROLE;

-- ===========================================================================
-- P2-4d. Adjacent behavior, single-run path: ONE live active run resolves the
-- normal step gate (require_steps -> allow after completing the steps).
-- ===========================================================================
DO $$
DECLARE
  v_uid uuid := '11111111-1111-1111-1111-111111111111';
  v_run uuid;
BEGIN
  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key)
  VALUES ('onboarding.p2one', '1.0.0', v_uid, v_uid, 'p2-4-one-run')
  RETURNING id INTO v_run;
  INSERT INTO p2_ctx (k, v) VALUES ('p2_4_one_run', v_run) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
END $$;

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_run uuid := (SELECT v FROM p2_ctx WHERE k = 'p2_4_one_run');
  v_decision jsonb;
BEGIN
  v_decision := public.resolve_onboarding_readiness('onboarding.p2one', '1.0.0');
  ASSERT v_decision->>'decision' = 'require_steps'
         AND v_decision->>'reason' = 'required_steps_incomplete'
         AND v_decision->>'run_id' = v_run::text
         AND jsonb_array_length(v_decision->'incomplete_steps') = 2,
    format('P2-4d FAIL: single active run did not resolve require_steps/incomplete: %s', v_decision);

  INSERT INTO public.onboarding_step_states (run_id, step_key, state) VALUES
    (v_run, 'onboarding.p2one.one', 'completed'),
    (v_run, 'onboarding.p2one.two', 'completed');

  v_decision := public.resolve_onboarding_readiness('onboarding.p2one', '1.0.0');
  ASSERT v_decision->>'decision' = 'allow' AND v_decision->>'reason' = 'required_steps_completed',
    format('P2-4d FAIL: single active run with steps completed did not resolve allow: %s', v_decision);
  RAISE NOTICE 'P2-4d PASS: single-run path unchanged (require_steps -> allow)';
END $$;

RESET ROLE;

-- ===========================================================================
-- P2-4e. An EXPIRED active run does NOT trip the ambiguity rule (expired rows
-- are not eligible): the fresh live run on onboarding.p2exp (left over from
-- P2-3b as an active-but-expired corpse) resolves normally.
-- ===========================================================================
DO $$
DECLARE
  v_uid uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key)
  VALUES ('onboarding.p2exp', '1.0.0', v_uid, v_uid, 'p2-4-exp-fresh');
END $$;

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_decision jsonb;
BEGIN
  v_decision := public.resolve_onboarding_readiness('onboarding.p2exp', '1.0.0');
  ASSERT v_decision->>'decision' = 'require_steps' AND v_decision->>'reason' = 'required_steps_incomplete',
    format('P2-4e FAIL: expired corpse poisoned the decision (expected require_steps on the fresh live run): %s', v_decision);
  RAISE NOTICE 'P2-4e PASS: expired active run is not eligible — no spurious ambiguity, fresh run resolves normally';
END $$;

RESET ROLE;

-- ===========================================================================
-- P2-4f. Adjacent behavior, superseded semantics preserved: a LATEST completed
-- run plus an OLDER still-live active run resolves require_steps/no_active_run
-- (the 170000 "completed run supersedes" rule), NOT ambiguity and NOT allow.
-- ===========================================================================
DO $$
DECLARE
  v_uid uuid := '11111111-1111-1111-1111-111111111111';
  v_completed uuid;
BEGIN
  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key, created_at)
  VALUES ('onboarding.p2sup', '1.0.0', v_uid, v_uid, 'p2-4-sup-active', '2026-10-26 12:00:00+00');
  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key, created_at)
  VALUES ('onboarding.p2sup', '1.0.0', v_uid, v_uid, 'p2-4-sup-completed', '2026-10-26 12:00:01+00')
  RETURNING id INTO v_completed;
  UPDATE public.onboarding_runs SET run_state = 'completed' WHERE id = v_completed;
END $$;

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_decision jsonb;
BEGIN
  v_decision := public.resolve_onboarding_readiness('onboarding.p2sup', '1.0.0');
  ASSERT v_decision->>'decision' = 'require_steps' AND v_decision->>'reason' = 'no_active_run',
    format('P2-4f FAIL: superseded semantics changed (expected require_steps/no_active_run): %s', v_decision);
  RAISE NOTICE 'P2-4f PASS: latest-completed + older-active keeps the superseded rule (no_active_run; not ambiguous, not allow)';
END $$;

RESET ROLE;

DO $$ BEGIN RAISE NOTICE '=== ALL P2 TIME + STATE-INTEGRITY ASSERTIONS PASSED ==='; END $$;
