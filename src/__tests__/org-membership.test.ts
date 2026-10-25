/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Contract tests for the org-membership Data API helper. The helper replaces
 * the broken app_private RPC path (which 404s via PostgREST) with a direct
 * organization_members query that works through the Data API inside RLS.
 */
import { test, expect, describe, vi } from 'vitest';
import { isOrgMemberViaDataApi } from '../../supabase/functions/_shared/org-membership.ts';

function clientReturning(result) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(result)),
        })),
      })),
    })),
  };
}

describe('isOrgMemberViaDataApi (org membership via the Data API)', () => {
  test('returns true when the caller has a membership row for the org', async () => {
    const client = clientReturning({ data: [{ organization_id: 'org-1' }], error: null });
    expect(await isOrgMemberViaDataApi(client, 'org-1')).toBe(true);
  });

  test('returns false when the caller has NO membership row for the org (cross-tenant)', async () => {
    const client = clientReturning({ data: [], error: null });
    expect(await isOrgMemberViaDataApi(client, 'org-other')).toBe(false);
  });

  test('fails closed (false) on query error', async () => {
    const client = clientReturning({ data: null, error: { message: 'db error' } });
    expect(await isOrgMemberViaDataApi(client, 'org-1')).toBe(false);
  });

  test('fails closed (false) on thrown exception', async () => {
    const client = {
      from: vi.fn(() => {
        throw new Error('boom');
      }),
    };
    expect(await isOrgMemberViaDataApi(client, 'org-1')).toBe(false);
  });

  test('returns false for an empty/missing organizationId', async () => {
    const client = clientReturning({ data: [{ organization_id: 'org-1' }], error: null });
    expect(await isOrgMemberViaDataApi(client, '')).toBe(false);
    expect(await isOrgMemberViaDataApi(client, null)).toBe(false);
    expect(await isOrgMemberViaDataApi(client, undefined)).toBe(false);
  });

  test('queries organization_members with the org filter and limit 1 (RLS-scoped)', async () => {
    const limitMock = vi.fn(() => Promise.resolve({ data: [{ organization_id: 'org-1' }], error: null }));
    const eqMock = vi.fn(() => ({ limit: limitMock }));
    const selectMock = vi.fn(() => ({ eq: eqMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    const client = { from: fromMock };

    await isOrgMemberViaDataApi(client, 'org-1');

    expect(fromMock).toHaveBeenCalledWith('organization_members');
    expect(selectMock).toHaveBeenCalledWith('organization_id');
    expect(eqMock).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(limitMock).toHaveBeenCalledWith(1);
  });
});
