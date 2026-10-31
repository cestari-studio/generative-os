-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the
-- root directory of this source tree.
--
-- 20261026180000_red_team_p1_fixes.sql
--
-- Independent red-team audit (docs/red-team-audit-provisioning-readiness-cycle.md)
-- found 0 P0 / 4 P1 / 5 P2. This ADDITIVE migration fixes the three P1s that sit
-- in the cycle's centerpieces. Forward-only: it does NOT edit the applied
-- 20261026120000 / 20261026150000 / 20261026170000 migrations.
--
-- P1-1  policy_snapshot.deny / run_state are client-erasable. The run-actor
--       UPDATE policy (FOR ALL) covers every column, so the target of a
--       server-recorded policy_denied could UPDATE policy_snapshot='{}' and
--       convert `blocked` back to `require_steps`; the same channel allowed
--       arbitrary run_state transitions. Fix: a guard trigger forbids a
--       non-service role from changing run_state or policy_snapshot (RLS is
--       bypassed for service_role, but the trigger is not — so the trigger must
--       itself no-op for service_role / SECURITY DEFINER paths and enforce only
--       for direct authenticated writes).
--
-- P1-2  Subject-only steps were completable by delegates at the RLS layer. Both
--       step-write policies hardcoded can_complete_step(run_id, step_key, NULL),
--       so the helper's p_step_type='subject' guard was unreachable. The step
--       type must be derived SERVER-SIDE, never client-supplied. Fix: add
--       subject_step_keys text[] to onboarding_journey_definitions (normative
--       config, service-managed) and make can_complete_step resolve the step's
--       subject-only class from the run's published definition when the caller
--       passes NULL (the RLS call sites). Consent/legal-identity steps named in
--       subject_step_keys are then never delegate-completable.
--
-- P1-3  onboarding_delegations.granted_by was unauthenticated free text — the
--       run actor could self-grant a delegation claiming the SUBJECT approved
--       it, forging the delegation audit chain. Fix: force granted_by =
--       auth.uid() on INSERT (and keep it immutable on UPDATE) via a trigger,
--       so the recorded grantor is always the effective principal.
--
-- Validated on disposable PostgreSQL 17.11 as authenticated + service_role with
-- RLS enforced. NOT applied remotely (owner authorization required).

-- ---------------------------------------------------------------------------
-- P1-2a. subject_step_keys on the journey definition (normative, service-managed)
-- ---------------------------------------------------------------------------
ALTER TABLE public.onboarding_journey_definitions
  ADD COLUMN IF NOT EXISTS subject_step_keys text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.onboarding_journey_definitions.subject_step_keys IS
  'Server-declared subset of required_step_keys that ONLY the subject may complete '
  '(consent, legal identity, representation). A delegate holding a delegation for '
  'such a step still cannot complete it. Normative config: writable only by '
  'service_role; resolved server-side by app_private.can_complete_step.';

-- ---------------------------------------------------------------------------
-- ADR §6.1/§6.2 (owner decision 2026-10-26): encode the P3 sensitive-declaration
-- set for onboarding.tenant. The 170000 seed predates the decision and carries
-- no subject_step_keys content (the column defaults to '{}'), which would leave
-- the subject-only guard vacuous for this wizard. Reconcile forward-only: set
-- subject_step_keys = {identity, organization} (legal-identity + legal-
-- representation are sensitive declarations completed by the subject personally).
-- mode stays at the self_service default (P2: no delegation for onboarding.tenant),
-- so no mode change is needed. Idempotent (re-apply is a no-op).
-- ---------------------------------------------------------------------------
UPDATE public.onboarding_journey_definitions
   SET subject_step_keys = ARRAY['onboarding.tenant.identity', 'onboarding.tenant.organization']
 WHERE wizard_key = 'onboarding.tenant'
   AND wizard_version = '1.0.0'
   AND status = 'published';

-- ---------------------------------------------------------------------------
-- P1-2b. can_complete_step: resolve the step's subject-only class from the run's
-- published definition when the caller passes NULL (the RLS call sites). A
-- client can no longer bypass the guard by omitting p_step_type — the helper
-- looks it up from trusted config. The explicit-parameter behavior is preserved
-- for service-side callers that pass p_step_type directly.
-- ---------------------------------------------------------------------------
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
  v_step_type text := p_step_type;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_run FROM public.onboarding_runs r WHERE r.id = p_run_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Derive the step's subject-only class from the run's PUBLISHED journey
  -- definition when the caller did not supply it (the RLS call sites pass NULL).
  -- This is server-authoritative: the client cannot opt a step out of the
  -- subject-only guard by omitting the parameter.
  IF v_step_type IS NULL THEN
    SELECT CASE WHEN p_step_key = ANY (d.subject_step_keys) THEN 'subject' ELSE NULL END
      INTO v_step_type
      FROM public.onboarding_journey_definitions d
      WHERE d.wizard_key = v_run.wizard_key
        AND d.wizard_version = v_run.wizard_version
        AND d.status = 'published'
      LIMIT 1;
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
  IF v_step_type = 'subject' THEN
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

-- ---------------------------------------------------------------------------
-- P1-1. run_state / policy_snapshot mutation guard.
-- A direct authenticated UPDATE must not change run_state or policy_snapshot
-- (those are server-authoritative: run_state drives blocked/run_state_blocked,
-- policy_snapshot carries the deny verdict). service_role bypasses RLS and is
-- the legitimate server writer, so the trigger no-ops when the current role is
-- service_role (or when auth.uid() is NULL, i.e. a SECURITY DEFINER server path).
-- ---------------------------------------------------------------------------
-- Runs as SECURITY INVOKER so current_user reflects the ACTUAL writing role.
-- Only a direct authenticated-role write (the browser contract) is restricted;
-- server/owner paths (service_role, the migration owner) may change
-- server-authoritative fields. (In the disposable fixture the migration owner
-- is the postgres superuser with BYPASSRLS, so the owner-path assertion P1-1d
-- exercises the trigger without RLS filtering; on the remote the owner is the
-- non-superuser `postgres` member of service_role.)
CREATE OR REPLACE FUNCTION app_private.guard_onboarding_run_server_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'authenticated' OR session_user = 'authenticated' THEN
    IF NEW.run_state IS DISTINCT FROM OLD.run_state THEN
      RAISE EXCEPTION 'onboarding_runs.run_state is server-authoritative and cannot be changed directly'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot THEN
      RAISE EXCEPTION 'onboarding_runs.policy_snapshot is server-authoritative and cannot be changed directly'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.guard_onboarding_run_server_fields() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS onboarding_runs_guard_server_fields ON public.onboarding_runs;
CREATE TRIGGER onboarding_runs_guard_server_fields
  BEFORE UPDATE ON public.onboarding_runs
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_onboarding_run_server_fields();

-- ---------------------------------------------------------------------------
-- P1-3. granted_by is the effective principal, never client-supplied.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.set_delegation_grantor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.granted_by := (SELECT auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    -- granted_by is immutable: restore the recorded grantor.
    NEW.granted_by := OLD.granted_by;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.set_delegation_grantor() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS onboarding_delegations_set_grantor ON public.onboarding_delegations;
CREATE TRIGGER onboarding_delegations_set_grantor
  BEFORE INSERT OR UPDATE ON public.onboarding_delegations
  FOR EACH ROW EXECUTE FUNCTION app_private.set_delegation_grantor();
