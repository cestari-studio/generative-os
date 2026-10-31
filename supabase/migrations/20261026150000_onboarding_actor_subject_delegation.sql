-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the
-- root directory of this source tree.
--
-- 20261026150000_onboarding_actor_subject_delegation.sql
--
-- ADR 0001 §2.7–§2.10 + Master Directive §6 — actor/subject semantics, delegation
-- policy, completion attribution, and idempotency scoping for the journey ledger.
--
-- ADDITIVE ONLY (forward-only, no edit of the applied 20261026120000 migration):
--   * onboarding_step_states  += completed_by uuid, completion_type text (CHECK).
--   * onboarding_delegations  NEW run-scoped delegation-policy table + RLS.
--   * app_private.can_complete_step(run, step, step_type) — SECURITY DEFINER
--     InitPlan-safe helper used by the tightened step-states RLS.
--   * onboarding_runs.idempotency_key: GLOBAL unique -> UNIQUE(actor_id,
--     wizard_key, idempotency_key) per §3.2 (one actor cannot collide with
--     another actor's run key).
--   * RLS TIGHTENING: run read stays actor OR subject; STEP WRITES now respect
--     run mode (self_service vs delegated) and the delegation policy.
--   * completed_by / completion_type are SERVER-DERIVED (never client-trusted):
--     a BEFORE INSERT/UPDATE trigger forces completed_by = auth.uid() and derives
--     completion_type from the run mode + delegation, ignoring any client value.
--
-- DRAFT — validated on disposable PostgreSQL 17.11; NOT applied remotely.
--
-- ---------------------------------------------------------------------------
-- 0. app_private schema (helper home; mirrors prior migrations)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. completed_by attribution on onboarding_step_states (additive, nullable)
-- ---------------------------------------------------------------------------
ALTER TABLE public.onboarding_step_states
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.onboarding_step_states
  ADD COLUMN IF NOT EXISTS completion_type text;

-- completion_type CHECK is added separately so the migration is idempotent and
-- so existing NULL rows (pre-attribution) remain valid.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'onboarding_step_states_completion_type_check'
  ) THEN
    ALTER TABLE public.onboarding_step_states
      ADD CONSTRAINT onboarding_step_states_completion_type_check
      CHECK (completion_type IS NULL OR completion_type IN ('subject', 'delegated_authorized', 'trusted_verifier'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS onboarding_step_states_completed_by_idx
  ON public.onboarding_step_states (completed_by) WHERE completed_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. onboarding_delegations — run-scoped delegation policy
-- ---------------------------------------------------------------------------
-- A delegation authorizes `actor_id` (the delegate) to complete the listed
-- `allowed_step_keys` on behalf of `subject_user_id` within ONE run. granted_by
-- is the server-side principal that created the delegation (an authorized
-- approver / service). status lifecycle: active | revoked | expired.
CREATE TABLE IF NOT EXISTS public.onboarding_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.onboarding_runs(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allowed_step_keys text[] NOT NULL DEFAULT '{}',
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_delegations_status_check CHECK (status IN ('active', 'revoked', 'expired')),
  CONSTRAINT onboarding_delegations_steps_nonempty CHECK (array_length(allowed_step_keys, 1) IS NOT NULL),
  CONSTRAINT onboarding_delegations_actor_subject_distinct CHECK (actor_id <> subject_user_id)
);

CREATE INDEX IF NOT EXISTS onboarding_delegations_run_idx ON public.onboarding_delegations (run_id, status);
CREATE INDEX IF NOT EXISTS onboarding_delegations_actor_idx ON public.onboarding_delegations (actor_id, status);
CREATE INDEX IF NOT EXISTS onboarding_delegations_subject_idx ON public.onboarding_delegations (subject_user_id, status);
-- One ACTIVE delegation per (run, delegate) — prevents ambiguous duplicate grants.
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_delegations_active_unique
  ON public.onboarding_delegations (run_id, actor_id) WHERE status = 'active';

DO $$
BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at ON public.onboarding_delegations';
  EXECUTE 'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.onboarding_delegations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
END $$;

ALTER TABLE public.onboarding_delegations ENABLE ROW LEVEL SECURITY;

-- RLS: only the run's actor or service_role may CREATE/manage delegations; the
-- subject may READ their own delegations. A delegate may READ the delegations
-- that name them (so the client can render what it is allowed to do).
DROP POLICY IF EXISTS onboarding_delegations_select ON public.onboarding_delegations;
CREATE POLICY onboarding_delegations_select ON public.onboarding_delegations
  FOR SELECT TO authenticated
  USING (
    actor_id = (SELECT auth.uid())
    OR subject_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.onboarding_runs r
      WHERE r.id = run_id AND r.actor_id = (SELECT auth.uid())
    )
  );

-- Writes (insert/update/delete) are restricted to the run's actor (the manager
-- of the delegation) via a DEFINER helper below — a bare auth.uid() subquery in
-- a WITH CHECK hits the InitPlan NULL bug, so management goes through the helper.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_delegations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_delegations TO service_role;

-- ---------------------------------------------------------------------------
-- 3. app_private.run_actor() — InitPlan-safe "is the caller the run's actor?"
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER justification (AGENTS.md rule 5 / §7.4 checklist):
--   * Why DEFINER: used inside RLS WITH CHECK / USING on onboarding_delegations
--     and onboarding_step_states. A bare `auth.uid()` in a policy subquery is
--     planned as a bare InitPlan where request.jwt.claims is not visible, so it
--     returns NULL (documented DEFECT A). Reading auth.uid() inside a DEFINER
--     function evaluates it in a normal context — InitPlan-safe.
--   * Hardening: SET search_path=''; fully qualified objects; EXECUTE revoked
--     from PUBLIC/anon; granted to authenticated + service_role.
CREATE OR REPLACE FUNCTION app_private.run_actor(p_run_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.actor_id FROM public.onboarding_runs r WHERE r.id = p_run_id;
$$;

REVOKE ALL ON FUNCTION app_private.run_actor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.run_actor(uuid) TO authenticated, service_role;

-- Delegation management (INSERT/UPDATE/DELETE) only by the run's actor.
DROP POLICY IF EXISTS onboarding_delegations_actor_insert ON public.onboarding_delegations;
CREATE POLICY onboarding_delegations_actor_insert ON public.onboarding_delegations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_private.run_actor(run_id)) = (SELECT auth.uid()));

DROP POLICY IF EXISTS onboarding_delegations_actor_update ON public.onboarding_delegations;
CREATE POLICY onboarding_delegations_actor_update ON public.onboarding_delegations
  FOR UPDATE TO authenticated
  USING ((SELECT app_private.run_actor(run_id)) = (SELECT auth.uid()))
  WITH CHECK ((SELECT app_private.run_actor(run_id)) = (SELECT auth.uid()));

DROP POLICY IF EXISTS onboarding_delegations_actor_delete ON public.onboarding_delegations;
CREATE POLICY onboarding_delegations_actor_delete ON public.onboarding_delegations
  FOR DELETE TO authenticated
  USING ((SELECT app_private.run_actor(run_id)) = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. app_private.can_complete_step(p_run_id, p_step_key, p_step_type)
-- ---------------------------------------------------------------------------
-- Server-authoritative decision: MAY auth.uid() write (complete) this step on
-- this run? Encodes the two run modes + the delegation policy:
--
--   self_service (run.actor_id == run.subject_user_id):
--     ONLY the subject (== actor) may write steps.
--   delegated (run.actor_id <> run.subject_user_id):
--     * the SUBJECT may always write their own steps (completion_type 'subject');
--     * the ACTOR (delegate) may write a step ONLY with a matching ACTIVE,
--       unexpired delegation whose allowed_step_keys contains step_key
--       (completion_type 'delegated_authorized');
--     * any other user: denied.
--
-- p_step_type is the per-step requirement class reserved for subject-only steps:
-- when p_step_type = 'subject', a delegate is NEVER allowed (consent, legal
-- representation, identity and other sensitive declarations — §2.2 delegated).
--
-- SECURITY DEFINER justification: used inside the step-states RLS WITH CHECK
-- (InitPlan-safe auth.uid()) and reads onboarding_runs/onboarding_delegations
-- without opening those tables' policies to the check. search_path='';
-- qualified objects; EXECUTE revoked from PUBLIC/anon.
CREATE OR REPLACE FUNCTION app_private.can_complete_step(p_run_id uuid, p_step_key text, p_step_type text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_run public.onboarding_runs;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_run FROM public.onboarding_runs r WHERE r.id = p_run_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- self_service: actor IS the subject -> only the subject writes.
  IF v_run.actor_id = v_run.subject_user_id THEN
    RETURN v_uid = v_run.subject_user_id;
  END IF;

  -- delegated run:
  -- the subject always completes their own steps.
  IF v_uid = v_run.subject_user_id THEN
    RETURN true;
  END IF;

  -- a step reserved for the subject can never be completed by a delegate.
  IF p_step_type = 'subject' THEN
    RETURN false;
  END IF;

  -- the actor (delegate) needs a matching ACTIVE, unexpired delegation for step_key.
  IF v_uid = v_run.actor_id THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.onboarding_delegations d
      WHERE d.run_id = p_run_id
        AND d.actor_id = v_uid
        AND d.subject_user_id = v_run.subject_user_id
        AND d.status = 'active'
        AND (d.expires_at IS NULL OR d.expires_at > now())
        AND p_step_key = ANY (d.allowed_step_keys)
    );
  END IF;

  -- any other principal: denied.
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION app_private.can_complete_step(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.can_complete_step(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION app_private.can_complete_step(uuid, text, text) IS
  'Server-authoritative step-completion gate (ADR 0001 §2.7–§2.10, Master Directive §6). SECURITY DEFINER + search_path='''' so auth.uid() is InitPlan-safe inside RLS. self_service: only the subject writes. delegated: subject always; actor only with a matching active unexpired delegation for step_key; p_step_type=''subject'' is never delegate-completable. Any other principal denied.';

-- ---------------------------------------------------------------------------
-- 5. RLS TIGHTENING on onboarding_step_states
-- ---------------------------------------------------------------------------
-- READ stays actor OR subject (unchanged visibility). WRITES now go through
-- can_complete_step so mode + delegation are enforced at the row level.
DROP POLICY IF EXISTS onboarding_step_states_actor_all ON public.onboarding_step_states;

DROP POLICY IF EXISTS onboarding_step_states_read ON public.onboarding_step_states;
CREATE POLICY onboarding_step_states_read ON public.onboarding_step_states
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.onboarding_runs r
    WHERE r.id = run_id AND (r.actor_id = (SELECT auth.uid()) OR r.subject_user_id = (SELECT auth.uid()))
  ));

DROP POLICY IF EXISTS onboarding_step_states_write ON public.onboarding_step_states;
CREATE POLICY onboarding_step_states_write ON public.onboarding_step_states
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_private.can_complete_step(run_id, step_key, NULL)));

DROP POLICY IF EXISTS onboarding_step_states_update ON public.onboarding_step_states;
CREATE POLICY onboarding_step_states_update ON public.onboarding_step_states
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.onboarding_runs r
    WHERE r.id = run_id AND (r.actor_id = (SELECT auth.uid()) OR r.subject_user_id = (SELECT auth.uid()))
  ))
  WITH CHECK ((SELECT app_private.can_complete_step(run_id, step_key, NULL)));

-- onboarding_runs policies: keep actor OR subject read/write of the run row
-- itself (creating a run, updating run_state, current_step_key, etc.). Step
-- completion authority is enforced at the step level, not the run level.

-- ---------------------------------------------------------------------------
-- 6. Server-derived completed_by / completion_type (BEFORE trigger)
-- ---------------------------------------------------------------------------
-- completed_by and completion_type are NEVER client-trusted (§3.1). This
-- trigger fires on INSERT and on UPDATE that sets state='completed', and:
--   * forces completed_by = auth.uid() (the effective principal), ignoring any
--     client-supplied value;
--   * derives completion_type from the run mode + delegation:
--       self_service / subject writer            -> 'subject'
--       delegate with an active delegation       -> 'delegated_authorized'
--       (a 'trusted_verifier' is reserved for a future server verifier flow and
--        is set by service-side code, never by an authenticated client.)
--   * stamps completed_at when transitioning to completed.
-- Runs as the row owner (BEFORE trigger, INVOKER-context) — reads are the same
-- rows the writer already sees; completed_by is set to auth.uid() read in a
-- normal (non-InitPlan) context.
CREATE OR REPLACE FUNCTION public.onboarding_step_attribution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_run public.onboarding_runs;
  v_uid uuid := (SELECT auth.uid());
BEGIN
  -- Only derive attribution when the row is being marked completed.
  IF NEW.state = 'completed' THEN
    SELECT * INTO v_run FROM public.onboarding_runs r WHERE r.id = NEW.run_id;

    -- completed_by is ALWAYS the effective principal, never the client value.
    NEW.completed_by := v_uid;

    IF v_run.actor_id = v_run.subject_user_id THEN
      -- self_service: completer is the subject.
      NEW.completion_type := 'subject';
    ELSIF v_uid = v_run.subject_user_id THEN
      -- delegated run completed by the subject themselves.
      NEW.completion_type := 'subject';
    ELSIF v_uid = v_run.actor_id THEN
      -- delegated run completed by the delegate under an active delegation
      -- (can_complete_step already enforced the delegation for the write).
      NEW.completion_type := 'delegated_authorized';
    ELSE
      -- A writer who is neither subject nor actor should have been blocked by
      -- RLS; if one slips through (service-side), keep their id but no trusted
      -- completion class.
      NEW.completion_type := NULL;
    END IF;

    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  ELSE
    -- Not a completion: never let a client pre-set attribution on a non-completed step.
    NEW.completed_by := NULL;
    NEW.completion_type := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS onboarding_step_attribution ON public.onboarding_step_states';
  EXECUTE 'CREATE TRIGGER onboarding_step_attribution BEFORE INSERT OR UPDATE ON public.onboarding_step_states FOR EACH ROW EXECUTE FUNCTION public.onboarding_step_attribution()';
END $$;

-- ---------------------------------------------------------------------------
-- 7. Idempotency scoping: global UNIQUE -> UNIQUE(actor_id, wizard_key, key)
-- ---------------------------------------------------------------------------
-- §3.2: a key reused by ANOTHER actor must not collide with (or expose) the
-- original run. Replace the global unique constraint with a composite one.
-- The old column UNIQUE from 20261026120000 created an implicit index/constraint
-- named onboarding_runs_idempotency_key_key.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'onboarding_runs_idempotency_key_key'
  ) THEN
    ALTER TABLE public.onboarding_runs DROP CONSTRAINT onboarding_runs_idempotency_key_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS onboarding_runs_actor_wizard_idem_unique
  ON public.onboarding_runs (actor_id, wizard_key, idempotency_key);

-- ---------------------------------------------------------------------------
-- 8. Grant hygiene: the public trigger helper is internal-only (CI grant guard).
-- onboarding_step_attribution is invoked by its trigger, never called directly —
-- revoke PUBLIC/anon EXECUTE (it is a public-schema trigger function).
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.onboarding_step_attribution() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.onboarding_step_attribution() FROM anon;
GRANT EXECUTE ON FUNCTION public.onboarding_step_attribution() TO authenticated, service_role;

COMMENT ON TABLE public.onboarding_step_states IS
  'One row per (run_id, step_key). completed_by + completion_type are SERVER-DERIVED by the onboarding_step_attribution trigger (never client-trusted). Step WRITES are gated by app_private.can_complete_step (run mode + delegation policy).';
COMMENT ON TABLE public.onboarding_delegations IS
  'Run-scoped delegation policy (ADR 0001 §2.2 delegated). actor_id (delegate) may complete allowed_step_keys on behalf of subject_user_id within run_id, while status=active and unexpired. Managed only by the run actor / service_role; subject + delegate may read their own rows.';
