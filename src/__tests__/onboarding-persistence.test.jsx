/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, vi, describe, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { TenantProvider } from '../context/TenantContext';
import { useTenant } from '../context/useTenant';

const wrapper = ({ children }) => <TenantProvider>{children}</TenantProvider>;

describe('onboarding persistence contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('context exposes loadOnboardingProgress and fail-closed passkey helpers', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    expect(typeof result.current.loadOnboardingProgress).toBe('function');
    expect(typeof result.current.saveOnboardingProgress).toBe('function');
  });

  test('registerPasskey denies anonymous callers (never simulates success)', async () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    // Anonymous users cannot register a passkey — the operation requires an
    // authenticated user. This is a fail-closed denial, not a simulated path.
    await act(async () => {
      await expect(result.current.registerPasskey()).rejects.toThrow(/sign in before registering/i);
    });
    expect(result.current.statusMessage).toMatch(/sign in before registering/i);
    // No synthetic credential was added to state.
    expect(result.current.passkeys).toEqual([]);
  });

  test('initial state has no synthetic tenant entities', () => {
    const { result } = renderHook(() => useTenant(), { wrapper });
    expect(result.current.organizations).toEqual([]);
    expect(result.current.workspaces).toEqual([]);
    expect(result.current.projects).toEqual([]);
    expect(result.current.effectiveSettings).toEqual([]);
    expect(result.current.knowledgeDocuments).toEqual([]);
    expect(result.current.mediaObjects).toEqual([]);
    expect(result.current.auditActions).toEqual([]);
    expect(result.current.activeOrganization).toBeNull();
    expect(result.current.activeWorkspace).toBeNull();
    expect(result.current.activeProject).toBeNull();
  });

  test('initialServerUser seeds user state for SSR hydration', () => {
    const ssrWrapper = ({ children }) => (
      <TenantProvider initialServerUser={{ id: 'usr_server_validated', email: 'person@example.com' }}>
        {children}
      </TenantProvider>
    );
    const { result } = renderHook(() => useTenant(), { wrapper: ssrWrapper });
    expect(result.current.user?.id).toBe('usr_server_validated');
  });

  test('signOut clears user and tenant state', async () => {
    const ssrWrapper = ({ children }) => (
      <TenantProvider initialServerUser={{ id: 'usr_server_validated', email: 'person@example.com' }}>
        {children}
      </TenantProvider>
    );
    const { result } = renderHook(() => useTenant(), { wrapper: ssrWrapper });
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.user).toBeNull();
    expect(result.current.person).toBeNull();
    expect(result.current.activeOrganizationId).toBeNull();
    expect(result.current.organizations).toEqual([]);
  });
});
