-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- REPRODUCTION of the red-team P1 cross-org readiness leak, run against the
-- PRE-FIX implementation (migrations up to 180000, BEFORE 190000). The pre-fix
-- resolve_onboarding_readiness selects the actor's LATEST run for the wizard
-- with NO target_organization_id filter, so a completed org-A run leaks `allow`
-- into org B.
--
-- This probe ASSERTS THE LEAK EXISTS (the "before" evidence). It must SUCCEED
-- against the pre-fix chain and would FAIL once 190000 is applied (the fix
-- closes the leak). The harness runs it in PHASE 1, before the fix migration.

\set QUIET on
\pset footer off

DO $$
DECLARE
  v_decision jsonb;
  v_run_id uuid;
  v_subject uuid := '11111111-1111-1111-1111-111111111111'::uuid;  -- member of A + B
  v_org_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  v_org_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
BEGIN
  RAISE NOTICE '=== REPRODUCTION: cross-org readiness leak (PRE-FIX) ===';

  -- Fixture (owner role): subject is a member of BOTH org A and org B.
  RESET ROLE;
  INSERT INTO public.organization_members (organization_id, member_id) VALUES
    (v_org_a, v_subject),
    (v_org_b, v_subject)
  ON CONFLICT DO NOTHING;

  -- Subject completes onboarding for org A (active run, all required steps done).
  UPDATE public.persons SET active_organization_id = v_org_a WHERE id = v_subject;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, target_organization_id, idempotency_key)
  VALUES ('onboarding.tenant', v_subject, v_subject, v_org_a, 'repro-orgA-complete') RETURNING id INTO v_run_id;
  INSERT INTO public.onboarding_step_states (run_id, step_key, state, completed_at, verified_at, validation_state) VALUES
    (v_run_id, 'onboarding.tenant.identity', 'completed', now(), now(), 'verified'),
    (v_run_id, 'onboarding.tenant.organization', 'completed', now(), now(), 'verified'),
    (v_run_id, 'onboarding.tenant.workspace', 'completed', now(), now(), 'verified');

  -- Switch the subject's active context to org B and re-evaluate. The PRE-FIX
  -- RPC ignores target_organization_id, so it finds the org-A run and leaks
  -- `allow` into org B.
  RESET ROLE;
  UPDATE public.persons SET active_organization_id = v_org_b WHERE id = v_subject;
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  SELECT public.resolve_onboarding_readiness('onboarding.tenant', '1.0.0') INTO v_decision;

  RAISE NOTICE 'PRE-FIX decision in org B context (completed run only in org A): %', v_decision;

  -- THE LEAK: pre-fix returns allow because run selection is not org-scoped.
  IF v_decision->>'decision' = 'allow' THEN
    RAISE NOTICE 'REPRODUCED: PRE-FIX leaks allow across orgs (org A run authorized org B). This is the P1.';
  ELSE
    RAISE EXCEPTION 'REPRODUCTION FAILED: expected the PRE-FIX implementation to leak allow into org B, got % (the leak may already be closed)', v_decision;
  END IF;

  RESET ROLE;
  RAISE NOTICE '=== REPRODUCTION CONFIRMED (pre-fix leaks allow cross-org) ===';

  -- Clean up the reproduction fixture so the post-fix assertion suite starts
  -- from a clean slate (the leak is proven above; state must not leak forward).
  DELETE FROM public.onboarding_runs WHERE idempotency_key = 'repro-orgA-complete';
  DELETE FROM public.organization_members WHERE member_id = v_subject;
END $$;
