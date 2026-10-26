-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the
-- root directory of this source tree.
--
-- 20261026120000_journey_ledger_onboarding_runs.sql
--
-- ADR 0001 (docs/adr-tenancy-and-journey-persistence.md) — journey run/step
-- persistence. ADDITIVE ONLY: creates two new tables + enums + RLS + indexes +
-- a SECURITY INVOKER readiness RPC. No existing table/policy/RPC/grant altered.
--
-- Closes failure states FS1 (rival onboarding ledgers) and FS3 (non-authoritative
-- resume). DRAFT — validated on disposable PostgreSQL 17.11; NOT applied remotely.
--
-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onboarding_run_state') THEN
    CREATE TYPE onboarding_run_state AS ENUM (
      'active', 'blocked', 'completed', 'expired', 'abandoned'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onboarding_step_state') THEN
    CREATE TYPE onboarding_step_state AS ENUM (
      'locked', 'available', 'in_progress', 'valid', 'completed',
      'invalid', 'skipped', 'expired', 'blocked', 'failed'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- onboarding_runs — one row per wizard run
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wizard_key text NOT NULL,
  wizard_version text NOT NULL DEFAULT '1.0.0',
  schema_version text NOT NULL DEFAULT '1.0.0',
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_step_key text,
  run_state onboarding_run_state NOT NULL DEFAULT 'active',
  idempotency_key text NOT NULL UNIQUE,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT onboarding_runs_wizard_key_charset CHECK (wizard_key ~ '^[a-z0-9_.-]+$')
);

CREATE INDEX IF NOT EXISTS onboarding_runs_actor_idx ON public.onboarding_runs (actor_id, run_state);
CREATE INDEX IF NOT EXISTS onboarding_runs_subject_idx ON public.onboarding_runs (subject_user_id, run_state);
CREATE INDEX IF NOT EXISTS onboarding_runs_expiry_idx ON public.onboarding_runs (expires_at) WHERE completed_at IS NULL;

-- ---------------------------------------------------------------------------
-- onboarding_step_states — one row per (run_id, step_key)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_step_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.onboarding_runs(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_version text NOT NULL DEFAULT '1.0.0',
  state onboarding_step_state NOT NULL DEFAULT 'available',
  payload_minimized jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_state text NOT NULL DEFAULT 'unverified',
  revision integer NOT NULL DEFAULT 1,
  saved_at timestamptz,
  verified_at timestamptz,
  completed_at timestamptz,
  error_code text,
  retryable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_step_states_run_step_unique UNIQUE (run_id, step_key),
  CONSTRAINT onboarding_step_states_step_key_charset CHECK (step_key ~ '^[a-z0-9_.-]+$'),
  CONSTRAINT onboarding_step_states_revision_positive CHECK (revision > 0)
);

CREATE INDEX IF NOT EXISTS onboarding_step_states_run_idx ON public.onboarding_step_states (run_id, state);

-- updated_at triggers (reuse existing public.set_updated_at())
DO $$
BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at ON public.onboarding_runs';
  EXECUTE 'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.onboarding_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at ON public.onboarding_step_states';
  EXECUTE 'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.onboarding_step_states FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
END $$;

-- ---------------------------------------------------------------------------
-- RLS — actor may read/write only their own runs (and steps of those runs).
-- Runs are private to the subject/actor; no cross-user or anon access.
-- ---------------------------------------------------------------------------
ALTER TABLE public.onboarding_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_step_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_runs_actor_all ON public.onboarding_runs;
CREATE POLICY onboarding_runs_actor_all ON public.onboarding_runs
  FOR ALL TO authenticated
  USING (actor_id = (SELECT auth.uid()) OR subject_user_id = (SELECT auth.uid()))
  WITH CHECK (actor_id = (SELECT auth.uid()) OR subject_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS onboarding_step_states_actor_all ON public.onboarding_step_states;
CREATE POLICY onboarding_step_states_actor_all ON public.onboarding_step_states
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.onboarding_runs r
    WHERE r.id = run_id AND (r.actor_id = (SELECT auth.uid()) OR r.subject_user_id = (SELECT auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.onboarding_runs r
    WHERE r.id = run_id AND (r.actor_id = (SELECT auth.uid()) OR r.subject_user_id = (SELECT auth.uid()))
  ));

GRANT SELECT, INSERT, UPDATE ON public.onboarding_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.onboarding_step_states TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.onboarding_runs TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.onboarding_step_states TO service_role;

-- ---------------------------------------------------------------------------
-- resolve_onboarding_readiness — SECURITY INVOKER, server-authoritative.
-- Returns the actor's active run + incomplete required steps. The actor is the
-- caller (auth.uid()); never a browser-supplied user id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_onboarding_readiness(p_required_step_keys text[] DEFAULT ARRAY[]::text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_run public.onboarding_runs;
  v_required text[] := COALESCE(p_required_step_keys, ARRAY[]::text[]);
  v_incomplete text[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'decision', 'unavailable',
      'reason', 'authentication_required',
      'run_id', NULL,
      'incomplete_steps', '[]'::jsonb,
      'required_steps', pg_catalog.to_jsonb(v_required),
      'next_step_key', NULL
    );
  END IF;

  SELECT * INTO v_run
  FROM public.onboarding_runs
  WHERE (actor_id = v_uid OR subject_user_id = v_uid)
    AND run_state = 'active'
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- No active run: onboarding has not started (or all runs completed/expired).
    RETURN pg_catalog.jsonb_build_object(
      'decision', CASE WHEN pg_catalog.array_length(v_required, 1) IS NULL THEN 'allow' ELSE 'require_steps' END,
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

REVOKE EXECUTE ON FUNCTION public.resolve_onboarding_readiness(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_onboarding_readiness(text[]) TO authenticated;

COMMENT ON FUNCTION public.resolve_onboarding_readiness(text[]) IS
  'Server-authoritative onboarding readiness (ADR 0001). SECURITY INVOKER; actor = auth.uid(). Returns decision allow|require_steps|unavailable + incomplete/next step. Completing a step never grants role/membership/entitlement.';
