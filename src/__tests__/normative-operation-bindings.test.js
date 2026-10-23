/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  getNormativeOperationBinding,
  invokeNormativeOperation,
  NORMATIVE_SETTINGS_FEATURE_BINDING,
} from '../data/normative-operation-bindings.js';
import { routes } from '../routes/config.js';

describe('normative settings feature binding', () => {
  it('binds the normative page and feature key to the existing settings route', () => {
    const settingsRoute = routes.find((route) => route.path === '/settings');

    expect(settingsRoute?.normativeBinding).toEqual(NORMATIVE_SETTINGS_FEATURE_BINDING);
    expect(NORMATIVE_SETTINGS_FEATURE_BINDING).toMatchObject({
      featureKey: 'platform.configuration_naming.config_cascade_resolve',
      pageKey: 'tenant.private.settings',
      routePath: '/settings',
      status: 'partial',
    });
  });

  it('dispatches effective-config-resolve to the destination resolver RPC', async () => {
    const rpcResult = { data: [], error: null };
    const rpc = vi.fn().mockResolvedValue(rpcResult);
    const args = {
      p_organization_id: 'test-org-from-unit-test',
      p_workspace_id: null,
      p_project_id: null,
      p_person_id: null,
    };

    await expect(invokeNormativeOperation({ rpc }, 'effective-config-resolve', args)).resolves.toEqual(rpcResult);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('resolve_effective_settings', args);
  });

  it('fails closed for the normative operation with no destination handler', async () => {
    const rpc = vi.fn();
    expect(getNormativeOperationBinding('public-host-resolve')).toMatchObject({
      status: 'blocked',
      target: null,
    });

    await expect(invokeNormativeOperation({ rpc }, 'public-host-resolve', {})).rejects.toThrow(
      'is not bound to a runtime handler',
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns null for unknown operation keys', () => {
    expect(getNormativeOperationBinding('operation.not_registered')).toBeNull();
  });
});
