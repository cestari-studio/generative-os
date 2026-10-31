-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the
-- root directory of this source tree.
--
-- 20261026170000_readiness_blocked_decision.sql
--
-- ADR 0001 (docs/adr-tenancy-and-journey-persistence.md) — readiness `blocked`
-- decision + the 'onboarding.tenant' trusted journey definition.
-- ADDITIVE ONLY: CREATE OR REPLACE on the readiness RPC (same (wizard_key,
-- version) signature) + a service-managed seed of one journey definition.
-- Migration 20261026120000 is NOT edited; no existing table/policy/grant altered.
--
-- Closes the readiness gaps from the prior cycle:
--   (1) `blocked` is a first-class decision, DISTINCT from allow/require_steps/
--       unavailable, and NEVER coerced to allow on any failure;
--   (2) the 'onboarding.tenant' wizard has a PUBLISHED, non-empty definition, so
--       ProtectedRoute's TENANT_ONBOARDING_WIZARD_KEY no longer resolves to
--       unavailable/journey_definition_missing.
--
-- ---------------------------------------------------------------------------
-- resolve_onboarding_readiness — SECURITY INVOKER, server-authoritative.
-- Decision: allow | require_steps | blocked | unavailable.
--
-- `blocked` taxonomy (mutually exclusive, evaluated before step resolution):
--   run_blocked       — the actor's current onboarding run has
--                       run_state = 'blocked' (run-level terminal block).
--   run_state_blocked — the run is in a non-resumable terminal state
--                       ('expired' | 'abandoned') yet still the latest.
--   policy_denied     — the run's captured policy_snapshot carries an explicit
--                       deny verdict ({...,"deny":true} or {"decision":"deny"}),
--                       recorded server-side when the run was snapshotted.
--
-- A blocked result is returned WITHOUT next_step_key / incomplete_steps and is
-- never collapsed into allow. The adapter (src/data/useOnboardingReadiness.js)
-- maps `blocked` to { status:'ready', decision:'blocked', reason } with no
-- nextStepKey — the route gate must not open the onboarding flow on blocked.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_onboarding_readiness(p_wizard_key text, p_wizard_version text DEFAULT '1.0.0')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_run public.onboarding_runs;
  v_required text[];
  v_incomplete text[];
  v_blocked jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'decision', 'unavailable',
      'reason', 'authentication_required',
      'run_id', NULL,
      'incomplete_steps', '[]'::jsonb,
      'required_steps', '[]'::jsonb,
      'next_step_key', NULL
    );
  END IF;

  -- Resolve required steps from TRUSTED server-side config, not from the client.
  SELECT required_step_keys INTO v_required
  FROM public.onboarding_journey_definitions
  WHERE wizard_key = p_wizard_key AND wizard_version = p_wizard_version AND status = 'published'
  LIMIT 1;

  IF NOT FOUND THEN
    -- No trusted definition for this wizard/version: we cannot determine what is
    -- required. That is an UNAVAILABLE state, never a permissive 'allow'.
    RETURN pg_catalog.jsonb_build_object(
      'decision', 'unavailable',
      'reason', 'journey_definition_missing',
      'run_id', NULL,
      'incomplete_steps', '[]'::jsonb,
      'required_steps', '[]'::jsonb,
      'next_step_key', NULL
    );
  END IF;

  -- Defensive: a definition that yields zero required steps is indistinguishable
  -- from "no requirement" -> would be unconditional 'allow'. Treat as unavailable
  -- (red-team DEFECT 2). The CHECK constraint also blocks publishing an empty list.
  IF v_required IS NULL OR pg_catalog.array_length(v_required, 1) IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'decision', 'unavailable',
      'reason', 'journey_definition_empty',
      'run_id', NULL,
      'incomplete_steps', '[]'::jsonb,
      'required_steps', '[]'::jsonb,
      'next_step_key', NULL
    );
  END IF;

  -- Locate the actor's CURRENT run for this wizard (latest, any state), so that
  -- a terminal/blocked run surfaces as `blocked` instead of silently starting over.
  SELECT * INTO v_run
  FROM public.onboarding_runs
  WHERE (actor_id = v_uid OR subject_user_id = v_uid)
    AND wizard_key = p_wizard_key
  ORDER BY created_at DESC
  LIMIT 1;

  -- ---------------------------------------------------------------------------
  -- BLOCKED: evaluate the run's block taxonomy BEFORE any step resolution. A
  -- blocked run never yields allow, require_steps, or a next step.
  -- ---------------------------------------------------------------------------
  IF FOUND THEN
    v_blocked := NULL;

    IF v_run.run_state = 'blocked' THEN
      v_blocked := pg_catalog.jsonb_build_object(
        'decision', 'blocked',
        'reason', 'run_blocked',
        'run_id', v_run.id
      );
    ELSIF v_run.run_state IN ('expired', 'abandoned') THEN
      v_blocked := pg_catalog.jsonb_build_object(
        'decision', 'blocked',
        'reason', 'run_state_blocked',
        'run_id', v_run.id
      );
    ELSIF v_run.run_state = 'active'
      AND (v_run.expires_at IS NULL OR v_run.expires_at > now())
      AND (
        COALESCE(v_run.policy_snapshot ->> 'deny', 'false') = 'true'
        OR pg_catalog.lower(COALESCE(v_run.policy_snapshot ->> 'decision', '')) = 'deny'
      )
    THEN
      -- An explicit deny verdict captured server-side in the run's policy
      -- snapshot. Evaluated only for a live active run; a completed run is allow.
      v_blocked := pg_catalog.jsonb_build_object(
        'decision', 'blocked',
        'reason', 'policy_denied',
        'run_id', v_run.id
      );
    END IF;

    IF v_blocked IS NOT NULL THEN
      RETURN v_blocked || pg_catalog.jsonb_build_object(
        'incomplete_steps', '[]'::jsonb,
        'required_steps', pg_catalog.to_jsonb(v_required),
        'next_step_key', NULL
      );
    END IF;
  END IF;

  -- No current run, or the latest run is completed and superseded: fall through
  -- to the normal active-run / step-resolution path.
  IF NOT FOUND OR v_run.run_state <> 'active' OR (v_run.expires_at IS NOT NULL AND v_run.expires_at <= now()) THEN
    -- No live active run for this wizard: onboarding has not started (or the
    -- last run completed cleanly). The required steps are those the trusted
    -- definition declares; the first is next.
    RETURN pg_catalog.jsonb_build_object(
      'decision', 'require_steps',
      'reason', 'no_active_run',
      'run_id', NULL,
      'incomplete_steps', pg_catalog.to_jsonb(v_required),
      'required_steps', pg_catalog.to_jsonb(v_required),
      'next_step_key', v_required[1]
    );
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(s.step_key), ARRAY[]::text[])
  INTO v_incomplete
  FROM (
    SELECT req.step_key
    FROM pg_catalog.unnest(v_required) AS req(step_key)
    LEFT JOIN public.onboarding_step_states st
      ON st.run_id = v_run.id AND st.step_key = req.step_key AND st.state = 'completed'
    WHERE st.id IS NULL
  ) s;

  IF pg_catalog.array_length(v_incomplete, 1) IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'decision', 'allow',
      'reason', 'required_steps_completed',
      'run_id', v_run.id,
      'incomplete_steps', '[]'::jsonb,
      'required_steps', pg_catalog.to_jsonb(v_required),
      'next_step_key', NULL
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'decision', 'require_steps',
    'reason', 'required_steps_incomplete',
    'run_id', v_run.id,
    'incomplete_steps', pg_catalog.to_jsonb(v_incomplete),
    'required_steps', pg_catalog.to_jsonb(v_required),
    'next_step_key', v_incomplete[1]
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_onboarding_readiness(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_onboarding_readiness(text, text) TO authenticated;

COMMENT ON FUNCTION public.resolve_onboarding_readiness(text, text) IS
  'Server-authoritative onboarding readiness (ADR 0001, P0 fix). SECURITY INVOKER; actor = auth.uid(). Required steps resolve SERVER-SIDE from onboarding_journey_definitions (trusted config), never from a client-supplied array. Decision allow|require_steps|blocked|unavailable; blocked (run_blocked|run_state_blocked|policy_denied) and unavailable (missing definition / backend failure) are NEVER silently allow.';

-- ---------------------------------------------------------------------------
-- Trusted journey definition for the tenant onboarding wizard — the key the
-- route gate (ProtectedRoute / TENANT_ONBOARDING_WIZARD_KEY) resolves. This is
-- service-managed normative config: onboarding_journey_definitions is writable
-- only by service_role (RLS), so this INSERT is executed by the migration owner
-- (service context), not by an end user. Published with a NON-EMPTY required
-- list so the CHECK constraint and the RPC's empty-list guard both hold.
-- Idempotent: safe to re-run; a newer published definition always wins via the
-- (wizard_key, wizard_version) uniqueness.
-- ---------------------------------------------------------------------------
INSERT INTO public.onboarding_journey_definitions (wizard_key, wizard_version, required_step_keys, status)
VALUES (
  'onboarding.tenant',
  '1.0.0',
  ARRAY[
    'onboarding.tenant.identity',
    'onboarding.tenant.organization',
    'onboarding.tenant.workspace'
  ],
  'published'
)
ON CONFLICT (wizard_key, wizard_version)
DO UPDATE SET
  required_step_keys = EXCLUDED.required_step_keys,
  status = EXCLUDED.status;
