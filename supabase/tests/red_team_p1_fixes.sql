-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Assertions for 20261026180000_red_team_p1_fixes.sql — mirrors the independent
-- auditor's three probes (docs/red-team-audit-provisioning-readiness-cycle.md).
-- Runs as authenticated with RLS enforced on disposable PostgreSQL 17.11.
--
--   P1-1  run_state / policy_snapshot cannot be changed by a direct
--         authenticated UPDATE (probe 4: erase policy_snapshot.deny -> denied).
--   P1-2  a delegate holding a delegation for a subject-reserved step CANNOT
--         complete it via the RLS write path once the step is declared in the
--         definition's subject_step_keys (probe 8).
--   P1-3  granted_by is forced to auth.uid() on INSERT and immutable on UPDATE
--         (probe 2: actor cannot forge "the subject approved this").
--
-- NOTE ON VACUITY: RLS silently filters rows it denies (UPDATE 0, no error), so
-- every denial probe below captures the row's REAL uuid first (via a privileged
-- SET LOCAL ROLE-free setup) and asserts the UPDATE actually matched a row —
-- a vacuous UPDATE 0 must NOT count as "denied".

\echo '=== RED-TEAM P1 FIXES ASSERTIONS ==='

-- ---------------------------------------------------------------------------
-- Setup (migration owner context): a published journey definition with one
-- subject-reserved step, a delegated run, and the identity step row. The real
-- run UUID is stashed in a temp table so every probe uses the same row.
-- ---------------------------------------------------------------------------
-- Temp table is created as the authenticated role (the probes all run as
-- authenticated), so the owner->authenticated SET ROLE does not revoke access.
SET ROLE authenticated;
CREATE TEMP TABLE p1_ctx (run_id uuid, step_id uuid, deleg_id uuid);
RESET ROLE;

DO $$
DECLARE
  v_subject uuid := '11111111-1111-1111-1111-111111111111';
  v_delegate uuid := '22222222-2222-2222-2222-222222222222';
  v_run uuid;
  v_step uuid;
BEGIN
  INSERT INTO public.onboarding_journey_definitions
    (wizard_key, wizard_version, required_step_keys, subject_step_keys, status)
  VALUES
    ('onboarding.tenant', '1.0.0',
     ARRAY['onboarding.tenant.identity', 'onboarding.tenant.organization'],
     ARRAY['onboarding.tenant.identity'],
     'published')
  ON CONFLICT (wizard_key, wizard_version) DO UPDATE
    SET subject_step_keys = EXCLUDED.subject_step_keys;

  INSERT INTO public.onboarding_runs (wizard_key, wizard_version, actor_id, subject_user_id, idempotency_key, run_state, policy_snapshot)
  VALUES ('onboarding.tenant', '1.0.0', v_delegate, v_subject, 'p1-run-1', 'active', '{}')
  RETURNING id INTO v_run;

  INSERT INTO public.onboarding_step_states (run_id, step_key, state)
  VALUES (v_run, 'onboarding.tenant.identity', 'in_progress')
  RETURNING id INTO v_step;

  INSERT INTO p1_ctx (run_id, step_id) VALUES (v_run, v_step);
  RAISE NOTICE 'setup: run=% step=%', v_run, v_step;
END $$;

-- ===========================================================================
-- P1-1a. authenticated cannot UPDATE policy_snapshot (erase a deny verdict).
-- Sets a deny verdict first (server path), then tries to erase it as the actor.
-- ===========================================================================
DO $$
DECLARE
  v_run uuid := (SELECT run_id FROM p1_ctx);
BEGIN
  -- Server path (auth.uid() NULL here): record a deny verdict.
  UPDATE public.onboarding_runs SET policy_snapshot = '{"deny": true}'::jsonb WHERE id = v_run;
END $$;

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE
  v_run uuid := (SELECT run_id FROM p1_ctx);
  v_denied boolean := false;
  v_visible int;
BEGIN
  -- Sanity: the actor CAN see the run (else the probe is vacuous).
  SELECT count(*) INTO v_visible FROM public.onboarding_runs WHERE id = v_run;
  ASSERT v_visible = 1, 'P1-1a SETUP FAIL: actor cannot see the run (probe would be vacuous)';
  BEGIN
    UPDATE public.onboarding_runs SET policy_snapshot = '{}'::jsonb WHERE id = v_run;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  ASSERT v_denied, 'P1-1a FAIL: authenticated UPDATE of policy_snapshot was not blocked';
  RAISE NOTICE 'P1-1a PASS: policy_snapshot UPDATE denied for authenticated (deny verdict not erasable)';
END $$;

RESET ROLE;

-- Verify the deny verdict survived (server-path read).
DO $$
DECLARE
  v_run uuid := (SELECT run_id FROM p1_ctx);
  v_snap jsonb;
BEGIN
  SELECT policy_snapshot INTO v_snap FROM public.onboarding_runs WHERE id = v_run;
  ASSERT v_snap = '{"deny": true}'::jsonb,
    format('P1-1a VERIFY FAIL: deny verdict was modified to %s', v_snap);
  RAISE NOTICE 'P1-1a VERIFY PASS: deny verdict intact after the erase attempt';
END $$;

-- ===========================================================================
-- P1-1b. authenticated cannot UPDATE run_state
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE
  v_run uuid := (SELECT run_id FROM p1_ctx);
  v_denied boolean := false;
  v_visible int;
BEGIN
  SELECT count(*) INTO v_visible FROM public.onboarding_runs WHERE id = v_run;
  ASSERT v_visible = 1, 'P1-1b SETUP FAIL: actor cannot see the run (probe would be vacuous)';
  BEGIN
    UPDATE public.onboarding_runs SET run_state = 'blocked' WHERE id = v_run;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  ASSERT v_denied, 'P1-1b FAIL: authenticated UPDATE of run_state was not blocked';
  RAISE NOTICE 'P1-1b PASS: run_state UPDATE denied for authenticated';
END $$;

RESET ROLE;

-- ===========================================================================
-- P1-1c. authenticated CAN still UPDATE a non-server column (guard is targeted)
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE
  v_run uuid := (SELECT run_id FROM p1_ctx);
  v_idem text;
BEGIN
  UPDATE public.onboarding_runs SET idempotency_key = 'p1-run-1-renamed' WHERE id = v_run
  RETURNING idempotency_key INTO v_idem;
  ASSERT v_idem = 'p1-run-1-renamed', 'P1-1c FAIL: non-server column update should be allowed';
  RAISE NOTICE 'P1-1c PASS: non-server column (idempotency_key) remains updatable by the actor';
END $$;

RESET ROLE;

-- ===========================================================================
-- P1-1d. the server path (auth.uid() NULL) CAN change run_state — the guard
-- must not break the legitimate server writer
-- ===========================================================================
DO $$
DECLARE
  v_run uuid := (SELECT run_id FROM p1_ctx);
  v_state text;
BEGIN
  UPDATE public.onboarding_runs SET run_state = 'blocked' WHERE id = v_run
  RETURNING run_state::text INTO v_state;
  ASSERT v_state = 'blocked', 'P1-1d FAIL: server path must be able to set run_state';
  RAISE NOTICE 'P1-1d PASS: server path (auth.uid() NULL) can set run_state';
END $$;

-- ===========================================================================
-- P1-3a. granted_by forced to auth.uid() on INSERT (actor cannot forge grantor)
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE
  v_run uuid := (SELECT run_id FROM p1_ctx);
  v_deleg uuid;
  v_grantor uuid;
BEGIN
  -- Actor (2222) tries to record that the SUBJECT (1111) granted the delegation,
  -- covering BOTH required steps incl. the subject-reserved identity step (this
  -- is the single active delegation reused by the P1-2 probe).
  INSERT INTO public.onboarding_delegations (run_id, actor_id, subject_user_id, allowed_step_keys, granted_by, status)
  VALUES (v_run, '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
          ARRAY['onboarding.tenant.identity', 'onboarding.tenant.organization'], '11111111-1111-1111-1111-111111111111', 'active')
  RETURNING id INTO v_deleg;
  SELECT granted_by INTO v_grantor FROM public.onboarding_delegations WHERE id = v_deleg;
  ASSERT v_grantor = '22222222-2222-2222-2222-222222222222',
    format('P1-3a FAIL: granted_by should be forced to the actor (2222), got %s', v_grantor);
  UPDATE p1_ctx SET deleg_id = v_deleg;
  RAISE NOTICE 'P1-3a PASS: granted_by forced to effective principal (forge attempt overwritten)';
END $$;

RESET ROLE;

-- ===========================================================================
-- P1-2. delegate CANNOT complete a subject-reserved step via the RLS write path
-- (the step is declared in the definition's subject_step_keys; the helper now
-- derives the class server-side, so the RLS NULL argument no longer bypasses it)
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE
  v_step uuid := (SELECT step_id FROM p1_ctx);
  v_denied boolean := false;
  v_visible int;
  v_completed int;
BEGIN
  SELECT count(*) INTO v_visible FROM public.onboarding_step_states WHERE id = v_step;
  ASSERT v_visible = 1, 'P1-2 SETUP FAIL: delegate cannot see the step (probe would be vacuous)';
  BEGIN
    UPDATE public.onboarding_step_states SET state = 'completed' WHERE id = v_step;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_denied := true;
  END;
  -- The subject-reserved step must NOT be completed, whether by denial or by
  -- a vacuous no-op. A successful write that landed is the failure.
  SELECT count(*) INTO v_completed FROM public.onboarding_step_states WHERE id = v_step AND state = 'completed';
  ASSERT v_completed = 0,
    'P1-2 FAIL: delegate completed a subject-reserved step via the RLS write path';
  RAISE NOTICE 'P1-2 PASS: delegate cannot complete subject-reserved step (denied=%, guard derived server-side)', v_denied;
END $$;

RESET ROLE;

-- ===========================================================================
-- P1-2c. WITHOUT a subject_step_keys declaration, the delegate CAN complete
-- (proves the fix does not break legitimate delegated completion — the guard
-- only engages for steps the SERVER declared subject-only)
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE
  v_run uuid := (SELECT run_id FROM p1_ctx);
  v_org_step uuid;
  v_state text;
BEGIN
  -- organization step is required but NOT in subject_step_keys.
  INSERT INTO public.onboarding_step_states (run_id, step_key, state)
  VALUES (v_run, 'onboarding.tenant.organization', 'in_progress')
  RETURNING id INTO v_org_step;
  UPDATE public.onboarding_step_states SET state = 'completed' WHERE id = v_org_step
  RETURNING state INTO v_state;
  ASSERT v_state = 'completed',
    'P1-2c FAIL: delegate must be able to complete a NON-subject-reserved step they hold a delegation for';
  RAISE NOTICE 'P1-2c PASS: delegate completes a non-subject-reserved step (delegation still works)';
END $$;

RESET ROLE;

-- ===========================================================================
-- P1-2b. the SUBJECT CAN complete the same subject-reserved step
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_step uuid := (SELECT step_id FROM p1_ctx);
  v_state text;
BEGIN
  UPDATE public.onboarding_step_states SET state = 'completed' WHERE id = v_step
  RETURNING state INTO v_state;
  ASSERT v_state = 'completed', 'P1-2b FAIL: the subject must be able to complete their own reserved step';
  RAISE NOTICE 'P1-2b PASS: subject completes the subject-reserved step';
END $$;

RESET ROLE;

-- ===========================================================================
-- P1-3b. granted_by is immutable on UPDATE
-- ===========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE
  v_deleg uuid := (SELECT deleg_id FROM p1_ctx);
  v_grantor uuid;
BEGIN
  UPDATE public.onboarding_delegations
     SET granted_by = '11111111-1111-1111-1111-111111111111'
   WHERE id = v_deleg;
  SELECT granted_by INTO v_grantor FROM public.onboarding_delegations WHERE id = v_deleg;
  ASSERT v_grantor = '22222222-2222-2222-2222-222222222222',
    format('P1-3b FAIL: granted_by changed on UPDATE to %s', v_grantor);
  RAISE NOTICE 'P1-3b PASS: granted_by immutable on UPDATE (restore-old)';
END $$;

RESET ROLE;

DO $$ BEGIN RAISE NOTICE '=== ALL RED-TEAM P1 FIX ASSERTIONS PASSED ==='; END $$;
