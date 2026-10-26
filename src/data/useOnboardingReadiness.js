/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Server-authoritative onboarding readiness adapter (ADR 0001 / Fase C).
 *
 * Reads the actor's readiness from the server via the `resolve_onboarding_readiness`
 * RPC (journey-ledger migration). NEVER trusts a browser-supplied step status and
 * never infers completion from `account_type`, name, counts, or plan_tier.
 *
 * Discriminated result (no collapsing):
 *   { status: 'ready', decision: 'allow', nextStepKey: null, runId }
 *   { status: 'ready', decision: 'require_steps', nextStepKey, runId, incompleteSteps }
 *   { status: 'ready', decision: 'blocked' | 'unavailable', reason }
 *   { status: 'checking' }                                   — initial, before resolution
 *   { status: 'unknown' }                                    — resolution failed; NOT "allowed"
 *   { status: 'unauthenticated' }                            — no signed-in user
 *   { status: 'unavailable_backend' }                        — RPC not deployed; NOT "allowed"
 *
 * The backend operation `resolve_onboarding_readiness` is provided by the
 * journey-ledger migration. If the RPC is not yet deployed (returns 404 /
 * function-not-found), the adapter surfaces `unavailable_backend` honestly
 * (a recorded dependency) rather than defaulting to allow or to a fabricated
 * local readiness — per Fase C: integrate to the limit of real code, register
 * the dependency, never substitute a mock in runtime.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase.client.js';

const CHECKING = Object.freeze({ status: 'checking', decision: null });
const UNAUTHENTICATED = Object.freeze({ status: 'unauthenticated', decision: null });

/**
 * Canonical wizard identity for the tenant onboarding journey. This NAMES which
 * trusted server-side definition (`onboarding_journey_definitions.wizard_key`)
 * the readiness RPC resolves — it is NOT a list of required steps. The required
 * steps are always resolved server-side from that published definition.
 */
export const TENANT_ONBOARDING_WIZARD_KEY = 'onboarding.tenant';

function normalizeRpc(data) {
  if (!data || typeof data !== 'object') return { status: 'unknown', decision: null };
  const decision = data.decision ?? null;
  if (decision === 'allow') {
    return { status: 'ready', decision: 'allow', nextStepKey: null, runId: data.run_id ?? null };
  }
  if (decision === 'require_steps') {
    return {
      status: 'ready',
      decision: 'require_steps',
      nextStepKey: data.next_step_key ?? null,
      runId: data.run_id ?? null,
      incompleteSteps: Array.isArray(data.incomplete_steps) ? data.incomplete_steps : [],
      reason: data.reason ?? 'required_steps_incomplete',
    };
  }
  if (decision === 'blocked' || decision === 'unavailable') {
    return { status: 'ready', decision, reason: data.reason ?? decision };
  }
  return { status: 'unknown', decision: null };
}

function isBackendMissing(error) {
  const msg = (error?.message ?? '').toLowerCase();
  return (
    error?.code === 'PGRST202' ||
    msg.includes('could not find the function') ||
    msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}

/**
 * Bounded readiness resolution (red-team F1): an RPC that hangs (never settles)
 * must NOT leave the gate on an unbounded spinner with no path to an explicit
 * non-authorized state. After RESOLUTION_TIMEOUT_MS the race rejects and the
 * adapter degrades to `unknown` (fail-closed: never children, never a
 * fabricated allow). The underlying RPC promise is left to settle on its own;
 * its late result is ignored because the timeout already won the race.
 */
export const RESOLUTION_TIMEOUT_MS = 15000;

class ResolutionTimeoutError extends Error {
  constructor() {
    super('readiness resolution timed out');
    this.name = 'ResolutionTimeoutError';
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new ResolutionTimeoutError()), ms);
    }),
  ]);
}

/**
 * @param {object} opts
 * @param {() => boolean} opts.isAuthenticated - whether a user is signed in
 * @param {string} opts.wizardKey - identifies the journey definition to resolve
 *   server-side. NEVER a list of required steps: the RPC resolves required steps
 *   from the trusted `onboarding_journey_definitions` config; the client only
 *   names WHICH wizard it is gating (Master Directive §11.1 — the client must
 *   not choose the set of steps whose completion counts as sufficient).
 * @param {string} [opts.wizardVersion] - journey definition version (RPC default '1.0.0')
 */
export function useOnboardingReadiness({ isAuthenticated, wizardKey, wizardVersion } = {}) {
  const [readiness, setReadiness] = useState(CHECKING);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resolve = useCallback(async () => {
    if (!isAuthenticated || !isAuthenticated()) {
      setReadiness(UNAUTHENTICATED);
      return UNAUTHENTICATED;
    }
    // Fail-closed: without a wizard identity we cannot ask the server to resolve
    // readiness. That is an `unknown` state, NEVER an implicit allow.
    if (!wizardKey || typeof wizardKey !== 'string') {
      const r = { status: 'unknown', decision: null, reason: 'wizard_key_missing' };
      if (mountedRef.current) setReadiness(r);
      return r;
    }
    setReadiness(CHECKING);
    try {
      const supabase = getSupabaseBrowserClient();
      // Server-authoritative: pass ONLY the wizard identity (key + version). The
      // required steps are resolved server-side from onboarding_journey_definitions.
      // We never send a client-supplied required-step list (that was the P0
      // authorization vector the journey-ledger migration removed).
      const args = { p_wizard_key: wizardKey };
      if (wizardVersion != null) args.p_wizard_version = wizardVersion;
      const { data, error } = await withTimeout(
        supabase.rpc('resolve_onboarding_readiness', args),
        RESOLUTION_TIMEOUT_MS,
      );
      if (error) {
        if (isBackendMissing(error)) {
          const r = {
            status: 'unavailable_backend',
            decision: null,
            reason: 'resolve_onboarding_readiness_not_deployed',
          };
          if (mountedRef.current) setReadiness(r);
          return r;
        }
        const r = { status: 'unknown', decision: null, error: error.message };
        if (mountedRef.current) setReadiness(r);
        return r;
      }
      const r = normalizeRpc(data);
      if (mountedRef.current) setReadiness(r);
      return r;
    } catch (err) {
      const r = {
        status: 'unknown',
        decision: null,
        error: err instanceof Error ? err.message : 'readiness resolution failed',
      };
      if (mountedRef.current) setReadiness(r);
      return r;
    }
  }, [isAuthenticated, wizardKey, wizardVersion]);

  return { readiness, resolve };
}

export default useOnboardingReadiness;
