/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Fase E — discriminated passkey list state. A list failure must NOT be
 * indistinguishable from "no credentials" (the plan's P0 fix).
 */
import { test, expect, vi, describe, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { TenantProvider } from '../context/TenantContext';
import { useTenant } from '../context/useTenant';

const wrapper = ({ children }) => <TenantProvider>{children}</TenantProvider>;
const ssrWrapper = ({ children }) => (
  <TenantProvider initialServerUser={{ id: 'usr_passkey_test', email: 'pk@example.com' }}>{children}</TenantProvider>
);

// Mock the browser Supabase client so we control auth.passkey.list behavior.
const baseAuth = (listImpl) => ({
  getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signOut: vi.fn().mockResolvedValue({}),
  ...(listImpl === undefined ? {} : { passkey: { list: listImpl } }),
});
const baseFrom = () =>
  vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }));

vi.mock('../lib/supabase.client.js', () => ({
  getSupabaseBrowserClient: vi.fn(() => ({
    auth: baseAuth(),
    from: baseFrom(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    storage: { from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ data: null, error: null }) })) },
  })),
}));

import { getSupabaseBrowserClient } from '../lib/supabase.client.js';

const mockAuthSession = (listImpl) => {
  getSupabaseBrowserClient.mockImplementation(() => ({
    auth: {
      ...baseAuth(listImpl),
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'usr_passkey_test' } } } }),
    },
    from: baseFrom(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    storage: { from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ data: null, error: null }) })) },
  }));
};

describe('passkey discriminated list state (Fase E)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('unauthenticated -> { status: unauthenticated } (not a list failure)', async () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    const res = await result.current.listPasskeys();
    expect(res.status).toBe('unauthenticated');
    expect(res.passkeys).toEqual([]);
  });

  test('ready -> returns the native list (possibly empty), distinct from a failure', async () => {
    const listMock = vi.fn().mockResolvedValue({ data: [{ id: 'cred-1' }], error: null });
    mockAuthSession(listMock);
    const { result } = renderHook(() => useTenant(), { wrapper: ssrWrapper });
    const res = await result.current.listPasskeys();
    expect(res.status).toBe('ready');
    expect(res.passkeys).toEqual([{ id: 'cred-1' }]);
  });

  test('list ERROR -> { status: unknown } and does NOT overwrite state (never rendered as "no passkey")', async () => {
    const listMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'network down' } });
    mockAuthSession(listMock);
    const { result } = renderHook(() => useTenant(), { wrapper: ssrWrapper });
    const res = await result.current.listPasskeys();
    expect(res.status).toBe('unknown');
    expect(res.error).toMatch(/network down/);
    // refreshPasskeys must NOT clear/overwrite state on a failure result.
    await act(async () => {
      await result.current.refreshPasskeys();
    });
    expect(result.current.passkeys).toEqual([]);
  });

  test('unsupported -> { status: unsupported } when auth.passkey.list is absent', async () => {
    mockAuthSession(undefined);
    const { result } = renderHook(() => useTenant(), { wrapper: ssrWrapper });
    const res = await result.current.listPasskeys();
    expect(res.status).toBe('unsupported');
  });
});
