-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the
-- root directory of this source tree.
--
-- 20261026200000_p2_time_state_integrity.sql
--
-- Red-team P2 hardening (docs/red-team-audit-provisioning-readiness-cycle.md):
-- state-integrity and time-reference fixes. ADDITIVE ONLY (forward-only): every
-- change is a CREATE OR REPLACE / new trigger / new index; it does NOT edit the
-- applied 20261026120000 / 20261026150000 / 20261026170000 / 20261026180000
-- migrations and alters no grants or policies.
--
--   P2-1  completed_at was client-backdatable (the attribution trigger stamped
--         it only IF NULL). Now completed_at is SERVER-CONTROLLED on both
--         onboarding_step_states and onboarding_runs: stamped with
--         clock_timestamp() ONLY on a valid transition INTO a completed state
--         (any client-supplied value is overwritten), immutable while the row
--         stays completed, and cleared when the row leaves the completed state.
--         onboarding_runs.completed_at additionally joins the P1-1 guard set:
--         a direct authenticated UPDATE can no longer change it at all.
--
--   P2-2  An EXPIRED-but-still-status='active' delegation corpse blocked
--         re-delegation: the partial unique index
--         onboarding_delegations_active_unique (run_id, actor_id) WHERE
--         status='active' kept the slot forever because expiry is lazy. Fix: a
--         BEFORE INSERT OR UPDATE trigger sweeps OTHER active-but-expired
--         delegations for the same (run_id, actor_id) to status='expired'
--         whenever a row is (re)activated, so a corpse never blocks a fresh
--         grant. Live-active conflicts still raise 23505 (constraint intact).
--         Revalidation on use: app_private.can_complete_step re-checks
--         status + expiry on EVERY write (RLS call sites), so an expired
--         delegation never authorizes — proven by the regression suite.
--
--   P2-3  now() is transaction-start time, frozen within a transaction.
--         Temporal comparisons were reviewed site by site:
--           * delegation expiry in can_complete_step   -> clock_timestamp()
--             (an authorization boundary is a WALL-CLOCK fact: a delegation
--             that expires mid-transaction must stop authorizing immediately).
--           * run expiry in resolve_onboarding_readiness -> clock_timestamp()
--             (same reasoning: the gate must not treat an expired run as live
--             because the request transaction started before the boundary).
--           * completed_at stamping (step + run)       -> clock_timestamp()
--             (audit-trail time is the actual moment the completion is
--             written; in a long transaction that completes several steps,
--             each row must carry its own true write time, not the shared
--             transaction-start time).
--           * created_at / updated_at / set_updated_at() KEEP now()
--             (bookkeeping inside one transaction; transaction-consistent
--             values are intended and these feed no expiry/TTL decision).
--
--   P2-4  resolve_onboarding_readiness picked the latest run with
--         ORDER BY created_at DESC LIMIT 1 — no deterministic tie-breaker, so
--         two runs sharing a created_at could be picked interchangeably, and
--         multiple live ACTIVE runs were silently reduced to an arbitrary one.
--         Fix: (a) deterministic ordering ORDER BY created_at DESC, id DESC;
--         (b) an explicit ambiguity rule — when MORE THAN ONE live ACTIVE run
--         is eligible for (caller, wizard), return unavailable/ambiguous_runs
--         rather than silently picking. blocked/run_state_blocked on the
--         single deterministically-latest run still surface (terminal states
--         are not "eligible active runs" and keep their 170000 precedence).
--
-- INTEGRATOR NOTE (Worker A interaction): migration
-- 20261026190000_readiness_org_scoping.sql (Worker A, P1-4) also CREATE OR
-- REPLACEs public.resolve_onboarding_readiness. Whichever migration applies
-- LAST wins the function body. VERIFIED EMPIRICALLY on disposable PG 17.11:
-- applying this 200000 file after Worker A's 190000 (naive last-writer-wins)
-- REVERTS their org-scoping — their suite (supabase/tests/
-- readiness_org_scoping.sql) then fails its core cross-org-leak assertion
-- (org B context allowed because of an org A run). The merge MUST therefore
-- produce ONE function body combining:
--   from THIS migration:
--   * ORDER BY created_at DESC, id DESC in the latest-run selection;
--   * the >1-live-active-run -> unavailable/ambiguous_runs rejection;
--   * clock_timestamp() for every run-expiry comparison;
--   from Worker A:
--   * the org-scope resolution (persons.active_organization_id validated by
--     app_private.is_org_member) and the target_organization_id predicate,
--     applied to BOTH the latest-run selection AND the live-active-run count;
--   * the fail-closed EXCEPTION WHEN OTHERS -> unavailable/resolution_error
--     wrapper (safe to keep around the merged body).
-- This file intentionally carries the NON-org-filtered variant (170000 base)
-- because the org filter is Worker A's owned change.
--
-- Validated on disposable PostgreSQL 17.11 as authenticated + service_role
-- with RLS enforced. NOT applied remotely (owner authorization required).

-- ---------------------------------------------------------------------------
-- P2-1a. Step completed_at is server-controlled (overwrite-on-transition,
-- immutable-while-completed, cleared-on-regression). Rewrites the attribution
-- trigger from 20261026150000 §6; completed_by / completion_type derivation is
-- preserved verbatim.
-- ---------------------------------------------------------------------------
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

    -- P2-1/P2-3: completed_at is SERVER-CONTROLLED. On a transition INTO
    -- completed the stamp is the wall-clock moment the completion is written
    -- (clock_timestamp(), not transaction-frozen now()); any client-supplied
    -- value is overwritten. While the row STAYS completed the timestamp is
    -- immutable (a client attempt to rewrite it is ignored). COALESCE
    -- backfills a legacy completed row that has no timestamp yet.
    IF TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM 'completed' THEN
      NEW.completed_at := pg_catalog.clock_timestamp();
    ELSE
      NEW.completed_at := COALESCE(OLD.completed_at, pg_catalog.clock_timestamp());
    END IF;
  ELSE
    -- Not a completion: never let a client pre-set attribution on a
    -- non-completed step; a regression out of completed clears the completion
    -- timestamp together with the rest of the attribution (P2-1).
    NEW.completed_by := NULL;
    NEW.completion_type := NULL;
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.onboarding_step_attribution() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.onboarding_step_attribution() FROM anon;
GRANT EXECUTE ON FUNCTION public.onboarding_step_attribution() TO authenticated, service_role;

-- The trigger itself already exists (20261026150000); re-assert it idempotently.
DO $$
BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS onboarding_step_attribution ON public.onboarding_step_states';
  EXECUTE 'CREATE TRIGGER onboarding_step_attribution BEFORE INSERT OR UPDATE ON public.onboarding_step_states FOR EACH ROW EXECUTE FUNCTION public.onboarding_step_attribution()';
END $$;

-- ---------------------------------------------------------------------------
-- P2-1b. Run completed_at joins the server-authoritative set. Extends the
-- P1-1 guard (20261026180000) in two ways:
--   * UPDATE: a direct authenticated write can no longer change completed_at
--     (alongside run_state / policy_snapshot). On the server path, a
--     transition INTO run_state='completed' stamps completed_at with
--     clock_timestamp() (overwriting even a server-supplied value: the
--     completion time is the time the transition is written); a transition
--     OUT of 'completed' clears it.
--   * INSERT: completed_at is normalized from birth — clock_timestamp() when
--     the run is born completed (server flows), NULL otherwise. A client can
--     never pre-set or backdate it.
-- Stays SECURITY INVOKER so current_user reflects the actual writing role
-- (see 20261026180000 for why the owner/service path must remain writable).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.guard_onboarding_run_server_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- completed_at is server-controlled from birth (P2-1): a client-supplied
    -- value is never trusted.
    IF NEW.run_state = 'completed' THEN
      NEW.completed_at := pg_catalog.clock_timestamp();
    ELSE
      NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF current_user = 'authenticated' OR session_user = 'authenticated' THEN
    IF NEW.run_state IS DISTINCT FROM OLD.run_state THEN
      RAISE EXCEPTION 'onboarding_runs.run_state is server-authoritative and cannot be changed directly'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot THEN
      RAISE EXCEPTION 'onboarding_runs.policy_snapshot is server-authoritative and cannot be changed directly'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'onboarding_runs.completed_at is server-authoritative and cannot be changed directly'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Server path (service_role / migration owner): completed_at follows the
    -- run_state transition (P2-1) with wall-clock stamping (P2-3).
    IF NEW.run_state = 'completed' AND OLD.run_state IS DISTINCT FROM 'completed' THEN
      NEW.completed_at := pg_catalog.clock_timestamp();
    ELSIF NEW.run_state IS DISTINCT FROM 'completed' AND OLD.run_state = 'completed' THEN
      NEW.completed_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.guard_onboarding_run_server_fields() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS onboarding_runs_guard_server_fields ON public.onboarding_runs;
CREATE TRIGGER onboarding_runs_guard_server_fields
  BEFORE INSERT OR UPDATE ON public.onboarding_runs
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_onboarding_run_server_fields();

-- ---------------------------------------------------------------------------
-- P2-2. Expired-delegation corpse sweep. Whenever a delegation row for
-- (run_id, actor_id) is inserted or (re)activated, any OTHER delegation for
-- the same (run_id, actor_id) that is still status='active' but past its
-- expires_at is flipped to status='expired', so the corpse no longer occupies
-- the onboarding_delegations_active_unique slot. Two genuinely LIVE active
-- delegations still collide (23505) — the constraint is preserved.
-- SECURITY INVOKER is sufficient and preferred (AGENTS.md rule 5): the writer
-- is already restricted to the run's actor by the INSERT/UPDATE policies (or
-- is service_role, which bypasses RLS), and the swept rows belong to the same
-- run, so the invoker's own privileges cover the UPDATE. clock_timestamp():
-- the corpse test is a wall-clock expiry question (P2-3).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.sweep_expired_delegations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE public.onboarding_delegations d
       SET status = 'expired'
     WHERE d.run_id = NEW.run_id
       AND d.actor_id = NEW.actor_id
       AND d.id <> NEW.id
       AND d.status = 'active'
       AND d.expires_at IS NOT NULL
       AND d.expires_at <= pg_catalog.clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.sweep_expired_delegations() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS onboarding_delegations_sweep_expired ON public.onboarding_delegations;
CREATE TRIGGER onboarding_delegations_sweep_expired
  BEFORE INSERT OR UPDATE ON public.onboarding_delegations
  FOR EACH ROW EXECUTE FUNCTION app_private.sweep_expired_delegations();

-- ---------------------------------------------------------------------------
-- P2-3a. can_complete_step: the delegation expiry check uses clock_timestamp()
-- (wall clock at the moment of the authorization decision), not the
-- transaction-frozen now(). Everything else is preserved verbatim from the
-- P1-2 fix (20261026180000): the subject-only class is still resolved
-- server-side from the run's published definition when the caller passes NULL.
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

  -- the actor (delegate) needs a matching ACTIVE, unexpired delegation for
  -- step_key. Expiry is a WALL-CLOCK boundary (P2-3): clock_timestamp(), so a
  -- delegation that expires mid-transaction stops authorizing immediately.
  IF v_uid = v_run.actor_id THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.onboarding_delegations d
      WHERE d.run_id = p_run_id
        AND d.actor_id = v_uid
        AND d.subject_user_id = v_run.subject_user_id
        AND d.status = 'active'
        AND (d.expires_at IS NULL OR d.expires_at > pg_catalog.clock_timestamp())
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
  'Server-authoritative step-completion gate (ADR 0001 §2.7–§2.10, Master Directive §6). SECURITY DEFINER + search_path='''' so auth.uid() is InitPlan-safe inside RLS. self_service: only the subject writes. delegated: subject always; actor only with a matching active unexpired delegation for step_key (expiry checked against clock_timestamp(), wall-clock); a step whose published definition lists it in subject_step_keys is never delegate-completable. Any other principal denied.';

-- ---------------------------------------------------------------------------
-- P2-3b + P2-4. resolve_onboarding_readiness — MERGED INTO 20261026190000.
--
-- This migration previously CREATE OR REPLACEd public.resolve_onboarding_readiness
-- with the deterministic-selection (ORDER BY created_at DESC, id DESC) +
-- >1-live-active -> ambiguous_runs + clock_timestamp() expiry hardening. However
-- Worker A's 20261026190000_readiness_org_scoping.sql ALSO CREATE OR REPLACEs the
-- same function to add org-scoping (P1-4), and naive last-writer-wins REVERTED
-- their org filter (verified empirically). The integrator merged the two into ONE
-- org-scoped body in 20261026190000 carrying BOTH:
--   * Worker A: org-scope resolution (persons.active_organization_id validated by
--     app_private.is_org_member) + target_organization_id predicate on BOTH the
--     latest-run selection AND the live-active-run count + the fail-closed
--     EXCEPTION WHEN OTHERS -> unavailable/resolution_error wrapper;
--   * Worker B (this migration's design): ORDER BY created_at DESC, id DESC;
--     >1-live-active-run -> unavailable/ambiguous_runs (count scoped to the SAME
--     wizard+version+org filter as the latest-run pick); clock_timestamp() for
--     every run-expiry comparison.
-- To avoid the revert hazard, THIS migration does NOT re-assert the function; the
-- merged org-scoped body is the single source of truth in 20261026190000. The
-- P2-3 expiry hardening that is NOT in the readiness RPC (can_complete_step's
-- delegation-expiry, completed_at stamping) remains here (above) and is
-- orthogonal to the org-scoping.
-- ---------------------------------------------------------------------------
