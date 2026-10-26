/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Fase C — onboarding readiness adapter (server-authoritative). Discriminated
 * result; never infers completion from account_type/name/counts/plan_tier;
 * never substitutes a mock in runtime when the backend is missing.
 */
import { test, expect, vi, describe, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnboardingReadiness } from '../data/useOnboardingReadiness';

const rpcMock = vi.fn();
vi.mock('../lib/supabase.client.js', () => ({
  getSupabaseBrowserClient: () => ({ rpc: rpcMock }),
}));

const authed = () => true;
const anon = () => false;

describe('useOnboardingReadiness (Fase C)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  test('unauthenticated -> { status: unauthenticated }, never resolves', async () => {
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: anon }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('unauthenticated');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  test('decision=allow -> ready/allow', async () => {
    rpcMock.mockResolvedValue({ data: { decision: 'allow', run_id: 'run-1' }, error: null });
    const { result } = renderHook(() =>
      useOnboardingReadiness({ isAuthenticated: authed, requiredStepKeys: ['a', 'b'] }),
    );
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('ready');
    expect(r.decision).toBe('allow');
    expect(rpcMock).toHaveBeenCalledWith('resolve_onboarding_readiness', { p_required_step_keys: ['a', 'b'] });
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
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed, requiredStepKeys: ['a'] }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.decision).toBe('require_steps');
    expect(r.nextStepKey).toBe('onboarding.person.address');
    expect(r.incompleteSteps).toEqual(['onboarding.person.address']);
  });

  test('backend missing (PGRST202) -> unavailable_backend, never defaults to allow or fabricated readiness', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.resolve_onboarding_readiness in the schema cache',
      },
    });
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('unavailable_backend');
    expect(r.decision).toBeNull();
  });

  test('RPC error (not missing) -> unknown, NOT allow', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('unknown');
    expect(r.decision).toBeNull();
  });

  test('thrown exception -> unknown, NOT allow', async () => {
    rpcMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useOnboardingReadiness({ isAuthenticated: authed }));
    let r;
    await act(async () => {
      r = await result.current.resolve();
    });
    expect(r.status).toBe('unknown');
  });
});
