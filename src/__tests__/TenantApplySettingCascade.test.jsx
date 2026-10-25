/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Contract test for applySettingCascade (settings-cascade slice, directive §3.4):
 * the interface must NOT show an override as applied before the backend
 * confirms the operation. Optimistic updates that survive an RPC failure are
 * a contract violation — a failed apply must leave the effective settings
 * untouched.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { TenantProvider } from '../context/TenantContext';
import { useTenant } from '../context/useTenant';
import * as supabaseClient from '../lib/supabase.client.js';

const rpcMock = vi.fn();

const ORG = { id: 'org-1', name: 'Org', identifier: 'org', schema_type: 'Organization' };
const SEEDED_SETTING = {
  property_id: 'theme.mode',
  effective_value: 'system',
  source_level: 'default',
  effective_cascade_rule: 'INHERIT_OVERRIDABLE',
  scope: 'general',
};

// Minimal thenable query builder that resolves per-table data.
function tableQuery(table) {
  const result = {
    organizations: { data: [ORG], error: null },
    workspaces: { data: [], error: null },
    projects: { data: [], error: null },
    knowledge_documents: { data: [], error: null },
    media_objects: { data: [], error: null },
    audit_actions: { data: [], error: null },
    persons: { data: [], error: null },
    passkey_credentials: { data: [], error: null },
  }[table] ?? { data: [], error: null };

  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve) => resolve(result),
  };
  return builder;
}

beforeEach(() => {
  rpcMock.mockReset();
  vi.spyOn(supabaseClient, 'getSupabaseBrowserClient').mockReturnValue({
    rpc: rpcMock,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: (table) => tableQuery(table),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const wrapper = ({ children }) => <TenantProvider>{children}</TenantProvider>;

describe('applySettingCascade contract: no unconfirmed overrides in UI state', () => {
  test('RPC failure leaves effectiveSettings WITHOUT the attempted override', async () => {
    rpcMock.mockImplementation((fn) => {
      if (fn === 'resolve_effective_settings') {
        return Promise.resolve({ data: [SEEDED_SETTING], error: null });
      }
      if (fn === 'apply_setting_cascade') {
        return Promise.resolve({ data: null, error: { message: 'policy denial: locked by organization' } });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const { result } = renderHook(() => useTenant(), { wrapper });

    // Wait until the seeded setting is actually loaded from the backend mock.
    await waitFor(() => {
      expect(result.current.effectiveSettings.some((s) => s.property_id === 'theme.mode')).toBe(true);
    });
    expect(result.current.effectiveSettings.find((s) => s.property_id === 'theme.mode')?.effective_value).toBe(
      'system',
    );

    // Apply an override attempt that the backend will reject.
    await act(async () => {
      await expect(
        result.current.applySettingCascade({
          level: 'workspace',
          propertyId: 'theme.mode',
          value: 'dark',
          cascadeRule: 'LOCKED',
        }),
      ).rejects.toThrow();
    });

    // CONTRACT: the effective settings must NOT show the rejected override.
    const themeSetting = result.current.effectiveSettings.find((s) => s.property_id === 'theme.mode');
    expect(themeSetting?.effective_value).not.toBe('dark');
    expect(themeSetting?.source_level).not.toBe('workspace');
    expect(themeSetting?.effective_cascade_rule).not.toBe('LOCKED');
  });

  test('RPC success confirms the override only after the backend responds', async () => {
    rpcMock.mockImplementation((fn) => {
      if (fn === 'resolve_effective_settings') {
        return Promise.resolve({ data: [SEEDED_SETTING], error: null });
      }
      if (fn === 'apply_setting_cascade') {
        return Promise.resolve({ data: { applied: true }, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => {
      expect(result.current.effectiveSettings.some((s) => s.property_id === 'theme.mode')).toBe(true);
    });

    await act(async () => {
      await result.current.applySettingCascade({
        level: 'workspace',
        propertyId: 'theme.mode',
        value: 'dark',
        cascadeRule: 'LOCKED',
      });
    });

    // The RPC must have been called with the right contract parameters.
    expect(rpcMock).toHaveBeenCalledWith(
      'apply_setting_cascade',
      expect.objectContaining({
        p_level: 'workspace',
        p_property_id: 'theme.mode',
        p_value: 'dark',
        p_cascade_rule: 'LOCKED',
      }),
    );
  });
});
