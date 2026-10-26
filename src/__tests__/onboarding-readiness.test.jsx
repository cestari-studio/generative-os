/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Fase C / Master Directive §11 — onboarding readiness adapter (server-authoritative).
 *
 * The adapter ONLY names WHICH wizard it is gating (wizard_key + version) and maps
 * the RPC's discriminated decision. It NEVER derives authorization from
 * account_type/name/record counts/plan_tier or any client-supplied value, NEVER
 * sends a client-chosen list of required steps, and NEVER fabricates a ready/allow
 * state when the backend is missing, malformed, blocked, or fails.
 */
import { test, expect, vi, describe, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useOnboardingReadiness,
  TENANT_ONBOARDING_WIZARD_KEY,
  RESOLUTION_TIMEOUT_MS,
} from '../data/useOnboardingReadiness';

const rpcMock = vi.fn();
vi.mock('../lib/supabase.client.js', () => ({
  getSupabaseBrowserClient: () => ({ rpc: rpcMock }),
}));

const authed = () => true;
const anon = () => false;
const WIZARD = TENANT_ONBOARDING_WIZARD_KEY;

describe('useOnboardingReadiness (Fase C / §11)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  test('unauthenticated -> { status: unauthenticated }, never resolves', async () => {
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: anon, wizardKey: WIZARD }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('unauthenticated');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // §11.1 — server-side principal/context derivation. The adapter must call the
  // RPC with ONLY (p_wizard_key, p_wizard_version); NO client data (account_type,
  // name, counts, plan_tier, or a required-step list) may influence the decision.
  test('RPC is called with (wizard_key, version) only; NO client data or required-step list is sent', async () => {
    rpcMock.mockResolvedValue({ data: { decision: 'allow', run_id: 'run-1' }, error: null });
    const { result } = renderHook(() =>
      useOnboardingReadiness({ isAuthenticated: authed, wizardKey: WIZARD, wizardVersion: '2.1.0' }),
    );
    await act(async () => {
      await result.current.resolve();
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fnName, args] = rpcMock.mock.calls[0];
    expect(fnName).toBe('resolve_onboarding_readiness');
    // Exactly the wizard identity and nothing else.
    expect(args).toEqual({ p_wizard_key: WIZARD, p_wizard_version: '2.1.0' });
    // No client-supplied authorization vector is present under any key.
    expect(args).not.toHaveProperty('p_required_step_keys');
    expect(args).not.toHaveProperty('required_step_keys');
    expect(args).not.toHaveProperty('account_type');
    expect(args).not.toHaveProperty('plan_tier');
    expect(args).not.toHaveProperty('p_user_id');
    expect(args).not.toHaveProperty('p_actor_id');
    expect(Object.keys(args).sort()).toEqual(['p_wizard_key', 'p_wizard_version']);
  });

  test('omitting wizardVersion sends only p_wizard_key (RPC applies its own default version)', async () => {
    rpcMock.mockResolvedValue({ data: { decision: 'allow', run_id: 'run-1' }, error: null });
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed, wizardKey: WIZARD }));
    await act(async () => {
      await result.current.resolve();
    });
    const [, args] = rpcMock.mock.calls[0];
    expect(args).toEqual({ p_wizard_key: WIZARD });
    expect(Object.keys(args)).toEqual(['p_wizard_key']);
  });

  // §11.3 — a missing wizard identity is fail-closed (unknown), never an implicit
  // allow, and never even reaches the network.
  test('missing wizardKey -> unknown, NOT allow, and RPC is never called', async () => {
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('unknown');
    expect(r.decision).toBeNull();
    expect(r.reason).toBe('wizard_key_missing');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  test('decision=allow -> ready/allow', async () => {
    rpcMock.mockResolvedValue({ data: { decision: 'allow', run_id: 'run-1' }, error: null });
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed, wizardKey: WIZARD }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('ready');
    expect(r.decision).toBe('allow');
    expect(r.nextStepKey).toBeNull();
    expect(rpcMock).toHaveBeenCalledWith('resolve_onboarding_readiness', { p_wizard_key: WIZARD });
  });

  test('decision=require_steps -> ready/require_steps with nextStepKey + incompleteSteps', async () => {
    rpcMock.mockResolvedValue({
      data: {
        decision: 'require_steps',
        next_step_key: 'onboarding.person.address',
        run_id: 'run-1',
        incomplete_steps: ['onboarding.person.address'],
        reason: 'required_steps_incomplete',
      },
      error: null,
    });
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed, wizardKey: WIZARD }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('ready');
    expect(r.decision).toBe('require_steps');
    expect(r.nextStepKey).toBe('onboarding.person.address');
    expect(r.incompleteSteps).toEqual(['onboarding.person.address']);
  });

  // §11 contract: all four decisions map to distinct adapter outcomes; `blocked`
  // must NOT collapse into allow or into a fabricated ready/next-step state.
  test('decision=blocked -> ready/blocked with reason, NOT allow and NO nextStepKey/incompleteSteps', async () => {
    rpcMock.mockResolvedValue({
      data: { decision: 'blocked', reason: 'policy_violation', run_id: 'run-1' },
      error: null,
    });
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed, wizardKey: WIZARD }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('ready');
    expect(r.decision).toBe('blocked');
    expect(r.reason).toBe('policy_violation');
    expect(r.decision).not.toBe('allow');
    expect(r).not.toHaveProperty('nextStepKey');
    expect(r).not.toHaveProperty('incompleteSteps');
  });

  test('decision=unavailable -> ready/unavailable with reason, NOT allow and NO fabricated ready state', async () => {
    rpcMock.mockResolvedValue({
      data: { decision: 'unavailable', reason: 'journey_definition_missing' },
      error: null,
    });
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed, wizardKey: WIZARD }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('ready');
    expect(r.decision).toBe('unavailable');
    expect(r.reason).toBe('journey_definition_missing');
    expect(r.decision).not.toBe('allow');
  });

  test('backend missing (PGRST202) -> unavailable_backend, never defaults to allow or fabricated readiness', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.resolve_onboarding_readiness in the schema cache',
      },
    });
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed, wizardKey: WIZARD }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('unavailable_backend');
    expect(r.decision).toBeNull();
  });

  test('RPC error (not missing) -> unknown, NOT allow', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed, wizardKey: WIZARD }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('unknown');
    expect(r.decision).toBeNull();
  });

  // §11.4 / no optimistic fallback: a network timeout (NOT a PGRST202
  // function-not-found) is a transport failure -> `unknown`, never `allow` and
  // never a fabricated ready/complete state.
  test('network timeout (rejected, not PGRST202) -> unknown, NOT allow or fabricated ready', async () => {
    const timeout = new Error('network request timed out');
    timeout.name = 'TimeoutError';
    rpcMock.mockRejectedValue(timeout);
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed, wizardKey: WIZARD }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('unknown');
    expect(r.decision).toBeNull();
    expect(r.decision).not.toBe('allow');
    expect(r).not.toHaveProperty('nextStepKey');
  });

  test('thrown exception -> unknown, NOT allow', async () => {
    rpcMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed, wizardKey: WIZARD }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('unknown');
  });

  test('malformed RPC payload (no error, unrecognized decision) -> unknown, NOT allow or fabricated ready', async () => {
    // A malformed payload must never be coerced into allow/ready — it is
    // normalized to `unknown` so the caller cannot treat it as cleared.
    rpcMock.mockResolvedValue({ data: { unexpected: 'shape' }, error: null });
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed, wizardKey: WIZARD }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('unknown');
    expect(r.decision).toBeNull();
    expect(r).not.toHaveProperty('nextStepKey');
  });

  test('empty-array RPC payload -> unknown, NOT allow (malformed is never cleared)', async () => {
    // MSW-style edge: an RPC that returns `[]` is not a valid decision envelope.
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed, wizardKey: WIZARD }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('unknown');
    expect(r.decision).toBeNull();
  });

  // Red-team F1: an RPC that HANGS (never settles) must not leave the gate on an
  // unbounded spinner — the bounded resolution timeout degrades to `unknown`
  // (fail-closed: never children, never a fabricated allow), giving the user a
  // path to an explicit non-authorized state.
  test('hanging RPC (never settles) -> unknown after the resolution timeout, NOT allow or a stuck spinner', async () => {
    vi.useFakeTimers();
    try {
      rpcMock.mockReturnValue(new Promise(() => {})); // never resolves
      const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed, wizardKey: WIZARD }));
      let resolvePromise;
      await act(async () => {
        resolvePromise = result.current.resolve();
      });
      // Still checking before the timeout elapses.
      expect(result.current.readiness.status).toBe('checking');
      // Advance past the resolution timeout: the race rejects -> unknown.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RESOLUTION_TIMEOUT_MS + 100);
      });
      const r = await resolvePromise;
      expect(r.status).toBe('unknown');
      expect(r.decision).toBeNull();
      expect(result.current.readiness.status).toBe('unknown');
      expect(result.current.readiness.status).not.toBe('checking');
      expect(result.current.readiness.decision).not.toBe('allow');
    } finally {
      vi.useRealTimers();
    }
  });
});
