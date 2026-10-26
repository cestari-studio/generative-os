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
 * @param {object} opts
 * @param {() => boolean} opts.isAuthenticated - whether a user is signed in
 * @param {string[]} opts.requiredStepKeys - step keys the gate requires completed
 */
export function useOnboardingReadiness({ isAuthenticated, requiredStepKeys = [] } = {}) {
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
    setReadiness(CHECKING);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('resolve_onboarding_readiness', {
        p_required_step_keys: requiredStepKeys,
      });
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
  }, [isAuthenticated, requiredStepKeys]);

  return { readiness, resolve };
}

export default useOnboardingReadiness;
