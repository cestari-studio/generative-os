-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the
-- root directory of this source tree.
--
-- 20261026190000_readiness_org_scoping.sql
--
-- MAX-PRIORITY P1 (red-team): readiness was NOT org-scoped. The prior
-- resolve_onboarding_readiness selected the actor's LATEST run for the wizard
-- (FROM onboarding_runs WHERE wizard_key AND (actor|subject) ORDER BY
-- created_at DESC LIMIT 1) with NO filter on target_organization_id. Result:
-- a completed onboarding run in org A yielded decision='allow' when the caller
-- was operating in org B — a cross-tenant isolation breach.
--
-- ADDITIVE ONLY (forward-only): CREATE OR REPLACE on the readiness RPC (same
-- (wizard_key, version) signature) + one ADD COLUMN on the trusted journey
-- definition. Does NOT edit 120000/150000/170000/180000; no existing
-- table/policy/grant altered. blocked taxonomy from 170000 is preserved.
--
-- THE ORG-SCOPE CONTRACT (owner-specified):
--   * scope='personal'      -> evaluate the subject's progress GLOBALLY (no org).
--   * scope='organizational', active org A, run completed for A
--                           -> may allow ONLY A (when all other policies pass).
--   * scope='organizational', active org B, only a run completed for A exists
--                           -> do NOT allow because of A's run.
--   * scope='organizational' without a valid target org context
--                           -> UNAVAILABLE (org_context_missing), never allow.
--   * caller without membership in the active org -> BLOCKED
--                           (org_membership_required), never allow.
--   * >1 eligible live run for the same context, no unambiguous selection
--                           -> UNAVAILABLE (ambiguous_runs) until resolved.
--   * NULL target_organization_id is NEVER a wildcard for "any organization".
--   * a delegated-actor authorization never silently becomes the subject's
--     personal/org authorization.
--
-- ORG-CONTEXT MECHANISM (server-trusted, NEVER a client argument):
--   The RPC keeps its (wizard_key, version) signature — the browser NEVER passes
--   an org id. The active org context is resolved SERVER-SIDE by reading
--   persons.active_organization_id for auth.uid() and INDEPENDENTLY validating
--   membership via app_private.is_org_member(org). Rationale:
--     * persons.active_organization_id is the app's canonical active-org marker
--       (TenantContext hydrates from it; the only sanctioned writer,
--       public.switch_active_context, validates is_org_member before writing).
--     * The RPC does NOT blindly trust the stored pointer: it re-validates
--       membership at evaluation time, so a stale or forged
--       active_organization_id degrades to blocked/org_membership_required,
--       never to allow.
--   A personal-scope journey bypasses org resolution entirely.
--
-- Validated on disposable PostgreSQL 17.11 as authenticated + RLS enforced.
-- NOT applied remotely (owner authorization required).

-- ---------------------------------------------------------------------------
-- 1. Journey scope declaration on the trusted definition (service-managed).
--    onboarding_journey_definitions is writable only by service_role (RLS), so
--    `scope` is normative config, never client-trusted. DEFAULT 'organizational'
--    is the FAIL-CLOSED choice: an undeclared journey demands a valid org
--    context rather than silently evaluating globally.
-- ---------------------------------------------------------------------------
ALTER TABLE public.onboarding_journey_definitions
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'organizational';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'onboarding_journey_def_scope_check'
  ) THEN
    ALTER TABLE public.onboarding_journey_definitions
      ADD CONSTRAINT onboarding_journey_def_scope_check
      CHECK (scope IN ('personal', 'organizational'));
  END IF;
END $$;

COMMENT ON COLUMN public.onboarding_journey_definitions.scope IS
  'Server-declared journey scope (normative config, service-managed). '
  '''personal'' evaluates the subject''s progress globally (no org context). '
  '''organizational'' (the fail-closed default) REQUIRES a valid active org '
  'context and only counts runs whose target_organization_id equals that org; '
  'NULL target_organization_id never matches. Resolved server-side by '
  'resolve_onboarding_readiness; never client-trusted.';

-- Owner decision recorded 2026-10-31: onboarding.tenant creates the initial
-- organization/workspace context, so readiness for this self-service journey
-- must be resolvable before the user has an active organization membership.
-- This is a per-journey normative value; the organizational default remains
-- fail-closed for every other journey. Personal scope does not grant membership,
-- roles, or entitlements; provisioning and RLS continue to enforce those.
UPDATE public.onboarding_journey_definitions
   SET scope = 'personal'
 WHERE wizard_key = 'onboarding.tenant'
   AND wizard_version = '1.0.0';

-- ---------------------------------------------------------------------------
-- 2. Org-scoped readiness. SECURITY INVOKER (actor = auth.uid()); required
--    steps + scope resolve SERVER-SIDE from the trusted definition. Decision:
--    allow | require_steps | blocked | unavailable. blocked/unavailable are
--    NEVER coerced to allow on any failure (a query exception is caught and
--    returned as unavailable/resolution_error, never allowed to bubble as a
--    client-interpretable success).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_onboarding_readiness(p_wizard_key text, p_wizard_version text DEFAULT '1.0.0')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_scope text;
  v_required text[];
  v_active_org uuid;
  v_org_member boolean;
  v_run public.onboarding_runs;
  v_run_count int;
  v_incomplete text[];
  v_blocked jsonb;
BEGIN
  -- Fail-closed: ANY unexpected error degrades to unavailable/resolution_error,
  -- NEVER to a permissive decision.
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

    -- Resolve required steps AND scope from TRUSTED server-side config.
    SELECT d.required_step_keys, d.scope
      INTO v_required, v_scope
      FROM public.onboarding_journey_definitions d
      WHERE d.wizard_key = p_wizard_key AND d.wizard_version = p_wizard_version AND d.status = 'published'
      LIMIT 1;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'decision', 'unavailable',
        'reason', 'journey_definition_missing',
        'run_id', NULL,
        'incomplete_steps', '[]'::jsonb,
        'required_steps', '[]'::jsonb,
        'next_step_key', NULL
      );
    END IF;

    -- Defensive: an empty required list is indistinguishable from "no
    -- requirement" -> would be unconditional allow. Treat as unavailable.
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

    -- Defensive default: an unrecognized/NULL scope is treated as
    -- 'organizational' (fail-closed) even if the CHECK is somehow bypassed.
    -- (The CHECK constrains scope to 'personal'|'organizational'; this guards a
    -- direct catalog write. Avoid pg_catalog-unqualified builtins here —
    -- search_path='' resolves only exact pg_catalog matches, and trim/lower on
    -- text are not reliable in this context. btrim/lower are used bare.)
    v_scope := pg_catalog.lower(btrim(COALESCE(v_scope, 'organizational')));
    IF v_scope NOT IN ('personal', 'organizational') THEN
      v_scope := 'organizational';
    END IF;

    -- -------------------------------------------------------------------------
    -- ORG CONTEXT (server-derived, NEVER a client argument).
    -- -------------------------------------------------------------------------
    v_active_org := NULL;
    IF v_scope = 'organizational' THEN
      -- Read the caller's active org pointer (server-side) and INDEPENDENTLY
      -- validate membership. persons.active_organization_id is user-writable
      -- (only via the membership-validating switch_active_context), so it must
      -- be re-validated here, never trusted blindly.
      SELECT p.active_organization_id INTO v_active_org
      FROM public.persons p
      WHERE p.id = v_uid;

      IF v_active_org IS NULL THEN
        -- Organizational journey with no active org context: unavailable,
        -- NEVER a permissive fallback.
        RETURN pg_catalog.jsonb_build_object(
          'decision', 'unavailable',
          'reason', 'org_context_missing',
          'run_id', NULL,
          'incomplete_steps', '[]'::jsonb,
          'required_steps', pg_catalog.to_jsonb(v_required),
          'next_step_key', NULL
        );
      END IF;

      SELECT app_private.is_org_member(v_active_org) INTO v_org_member;
      IF NOT COALESCE(v_org_member, false) THEN
        -- Caller names an org they are not a member of (stale/forged pointer):
        -- blocked, NEVER allow.
        RETURN pg_catalog.jsonb_build_object(
          'decision', 'blocked',
          'reason', 'org_membership_required',
          'run_id', NULL,
          'incomplete_steps', '[]'::jsonb,
          'required_steps', pg_catalog.to_jsonb(v_required),
          'next_step_key', NULL
        );
      END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- RUN SELECTION (merged with Worker B's P2-3/P2-4 hardening). Count eligible
    -- live runs first so AMBIGUITY (>1) resolves to unavailable/ambiguous_runs
    -- instead of an arbitrary latest-wins pick. The ambiguity count uses the SAME
    -- wizard+version+(org) filter as the latest-run pick below, so a terminal
    -- run that surfaces as blocked is never accompanied by a phantom ambiguous
    -- count from a different-version/org run.
    --   organizational: only runs whose target_organization_id = active org.
    --                   NULL target_organization_id never matches a real org.
    --   personal:       global (no org filter).
    -- A live run = run_state='active' AND unexpired; run expiry is a WALL-CLOCK
    -- boundary -> clock_timestamp() (Worker B P2-3), NOT transaction-frozen now().
    -- -------------------------------------------------------------------------
    IF v_scope = 'organizational' THEN
      SELECT pg_catalog.count(*) INTO v_run_count
      FROM public.onboarding_runs r
      WHERE (r.actor_id = v_uid OR r.subject_user_id = v_uid)
        AND r.wizard_key = p_wizard_key
        AND r.wizard_version = p_wizard_version
        AND r.target_organization_id = v_active_org
        AND r.run_state = 'active'
        AND (r.expires_at IS NULL OR r.expires_at > pg_catalog.clock_timestamp());
    ELSE
      SELECT pg_catalog.count(*) INTO v_run_count
      FROM public.onboarding_runs r
      WHERE (r.actor_id = v_uid OR r.subject_user_id = v_uid)
        AND r.wizard_key = p_wizard_key
        AND r.wizard_version = p_wizard_version
        AND r.run_state = 'active'
        AND (r.expires_at IS NULL OR r.expires_at > pg_catalog.clock_timestamp());
    END IF;

    IF v_run_count > 1 THEN
      RETURN pg_catalog.jsonb_build_object(
        'decision', 'unavailable',
        'reason', 'ambiguous_runs',
        'run_id', NULL,
        'incomplete_steps', '[]'::jsonb,
        'required_steps', pg_catalog.to_jsonb(v_required),
        'next_step_key', NULL
      );
    END IF;

    -- Select the single latest run for this wizard+version+org context (any
    -- state), so a terminal/blocked run surfaces as `blocked` rather than
    -- silently restarting. P2-4 (Worker B): ORDER BY created_at DESC, id DESC —
    -- the (created_at, id) pair is unique (id is the PK), so the pick is fully
    -- deterministic and independent of insertion order or plan choices.
    IF v_scope = 'organizational' THEN
      SELECT * INTO v_run
      FROM public.onboarding_runs r
      WHERE (r.actor_id = v_uid OR r.subject_user_id = v_uid)
        AND r.wizard_key = p_wizard_key
        AND r.wizard_version = p_wizard_version
        AND r.target_organization_id = v_active_org
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 1;
    ELSE
      SELECT * INTO v_run
      FROM public.onboarding_runs r
      WHERE (r.actor_id = v_uid OR r.subject_user_id = v_uid)
        AND r.wizard_key = p_wizard_key
        AND r.wizard_version = p_wizard_version
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 1;
    END IF;

    -- -------------------------------------------------------------------------
    -- BLOCKED taxonomy (evaluated before step resolution; preserved from 170000).
    -- A blocked run never yields allow / require_steps / a next step.
    -- -------------------------------------------------------------------------
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
        AND (v_run.expires_at IS NULL OR v_run.expires_at > pg_catalog.clock_timestamp())
        AND (
          COALESCE(v_run.policy_snapshot ->> 'deny', 'false') = 'true'
          OR pg_catalog.lower(COALESCE(v_run.policy_snapshot ->> 'decision', '')) = 'deny'
        )
      THEN
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

    -- No run in this context, or the latest is completed/superseded/expired:
    -- fall through to require_steps. A COMPLETED run is superseded here — the
    -- gate has already been passed for this context, so a fresh run is offered.
    IF NOT FOUND OR v_run.run_state <> 'active' OR (v_run.expires_at IS NOT NULL AND v_run.expires_at <= pg_catalog.clock_timestamp()) THEN
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
  EXCEPTION WHEN OTHERS THEN
    -- A query/RLS/permission failure NEVER returns allow.
    RETURN pg_catalog.jsonb_build_object(
      'decision', 'unavailable',
      'reason', 'resolution_error',
      'run_id', NULL,
      'incomplete_steps', '[]'::jsonb,
      'required_steps', '[]'::jsonb,
      'next_step_key', NULL
    );
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_onboarding_readiness(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_onboarding_readiness(text, text) TO authenticated;

COMMENT ON FUNCTION public.resolve_onboarding_readiness(text, text) IS
  'Server-authoritative, ORG-SCOPED onboarding readiness (ADR 0001, red-team P1 fix). '
  'SECURITY INVOKER; actor = auth.uid(). The active org context is resolved SERVER-SIDE '
  'from persons.active_organization_id validated via app_private.is_org_member — NEVER a '
  'client argument. scope=personal evaluates globally; scope=organizational (fail-closed '
  'default) requires a valid org context and only counts runs whose target_organization_id '
  'equals it (NULL never matches). Decision allow|require_steps|blocked|unavailable; '
  'blocked (run_blocked|run_state_blocked|policy_denied|org_membership_required) and '
  'unavailable (definition missing/empty|org_context_missing|ambiguous_runs|'
  'authentication_required|resolution_error) are NEVER coerced to allow.';
