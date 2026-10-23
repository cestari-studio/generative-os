/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Destination-side bindings for a narrow normative vertical slice.
 *
 * Normative keys refer to the read-only genOS contract. They are not database
 * identifiers and do not imply that unbound operations are available.
 */
export const NORMATIVE_SETTINGS_FEATURE_BINDING = Object.freeze({
  featureKey: 'platform.configuration_naming.config_cascade_resolve',
  pageKey: 'tenant.private.settings',
  routePath: '/settings',
  status: 'partial',
  operationBindings: Object.freeze({
    'effective-config-resolve': Object.freeze({
      status: 'implemented',
      transport: 'supabase.rpc',
      target: 'resolve_effective_settings',
    }),
    'public-host-resolve': Object.freeze({
      status: 'blocked',
      transport: null,
      target: null,
      reason: 'No authoritative destination handler is wired; fail closed until reviewed.',
    }),
  }),
});

export function getNormativeOperationBinding(operationId) {
  const bindings = NORMATIVE_SETTINGS_FEATURE_BINDING.operationBindings;
  if (typeof operationId !== 'string' || !Object.prototype.hasOwnProperty.call(bindings, operationId)) {
    return null;
  }
  return bindings[operationId];
}

export async function invokeNormativeOperation(supabase, operationId, args) {
  const binding = getNormativeOperationBinding(operationId);

  if (!binding || binding.status !== 'implemented' || binding.transport !== 'supabase.rpc' || !binding.target) {
    throw new Error(`Normative operation "${operationId}" is not bound to a runtime handler`);
  }

  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new TypeError('A Supabase client exposing rpc() is required');
  }

  return supabase.rpc(binding.target, args);
}
