// Copyright IBM Corp. 2026
//
// This source code is licensed under the Apache-2.0 license found in the
// LICENSE file in the root directory of this source tree.

/**
 * Shared tenant-access decision for Edge Functions that act on a
 * browser-supplied organizationId.
 *
 * Browser-sent organization/workspace/project IDs are UNTRUSTED input. The
 * function must (1) authenticate the user from their JWT and (2) prove org
 * membership server-side before any data operation. This helper returns a
 * decision object so the caller can short-circuit with the right HTTP status
 * — the decision logic is unit-testable without a live Supabase.
 */

export interface TenantAccessDeps {
  /** Returns the authenticated user id, or null when the JWT is invalid/absent. */
  getUserId: () => Promise<string | null>;
  /** Returns true when the given user is a member of the given organization. */
  isOrgMember: (userId: string, organizationId: string) => Promise<boolean>;
}

export interface TenantAccessDecision {
  status: 200 | 400 | 401 | 403;
  error?: string;
  userId?: string;
  organizationId?: string;
}

/**
 * Evaluate whether the request may proceed against the given organization.
 * Fails closed: any doubt is a denial.
 */
export async function evaluateTenantAccess(
  organizationId: unknown,
  deps: TenantAccessDeps,
): Promise<TenantAccessDecision> {
  if (typeof organizationId !== 'string' || organizationId.trim() === '') {
    return { status: 400, error: 'organizationId is required' };
  }

  const userId = await deps.getUserId();
  if (!userId) {
    return { status: 401, error: 'Unauthorized: valid user token required' };
  }

  let member = false;
  try {
    member = await deps.isOrgMember(userId, organizationId);
  } catch {
    // Membership check failing is a denial, never a pass.
    member = false;
  }
  if (!member) {
    return { status: 403, error: 'Access denied: not an organization member' };
  }

  return { status: 200, userId, organizationId };
}
