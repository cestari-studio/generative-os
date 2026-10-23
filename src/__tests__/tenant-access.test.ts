/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Contract tests for the shared tenant-access decision used by Edge
 * Functions (vector-rag first). Browser-supplied organizationId is untrusted:
 * the function must authenticate the user and prove org membership
 * server-side, failing closed on any doubt.
 */
import { test, expect, describe, vi } from 'vitest';
import { evaluateTenantAccess } from '../../supabase/functions/_shared/tenant-access.ts';

const depsFor = ({ userId = 'user-1', memberOrgs = [] as string[], throwOnCheck = false } = {}) => ({
  getUserId: vi.fn(async () => userId),
  isOrgMember: vi.fn(async (_userId: string, orgId: string) => {
    if (throwOnCheck) throw new Error('membership rpc unavailable');
    return memberOrgs.includes(orgId);
  }),
});

describe('evaluateTenantAccess (cross-tenant denial proofs)', () => {
  test('missing organizationId -> 400', async () => {
    const deps = depsFor({ memberOrgs: ['org-a'] });
    for (const bad of [undefined, null, '', '   ', 42]) {
      const outcome = await evaluateTenantAccess(bad, deps);
      expect(outcome.status).toBe(400);
      expect(outcome.error).toMatch(/organizationId is required/);
    }
  });

  test('unauthenticated caller -> 401, membership never checked', async () => {
    const deps = depsFor({ userId: null, memberOrgs: ['org-a'] });
    const outcome = await evaluateTenantAccess('org-a', deps);
    expect(outcome.status).toBe(401);
    expect(deps.isOrgMember).not.toHaveBeenCalled();
  });

  test('member of org A cannot access org B (cross-tenant denial)', async () => {
    const deps = depsFor({ userId: 'user-1', memberOrgs: ['org-a'] });
    const outcome = await evaluateTenantAccess('org-b', deps);
    expect(outcome.status).toBe(403);
    expect(outcome.error).toMatch(/not an organization member/);
    expect(deps.isOrgMember).toHaveBeenCalledWith('user-1', 'org-b');
  });

  test('membership check failure fails closed (403, never a silent pass)', async () => {
    const deps = depsFor({ userId: 'user-1', throwOnCheck: true });
    const outcome = await evaluateTenantAccess('org-a', deps);
    expect(outcome.status).toBe(403);
  });

  test('valid member gets 200 with the validated userId and organizationId', async () => {
    const deps = depsFor({ userId: 'user-1', memberOrgs: ['org-a'] });
    const outcome = await evaluateTenantAccess('org-a', deps);
    expect(outcome.status).toBe(200);
    expect(outcome.userId).toBe('user-1');
    expect(outcome.organizationId).toBe('org-a');
  });
});
