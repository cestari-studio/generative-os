// Copyright IBM Corp. 2026
//
// This source code is licensed under the Apache-2.0 license found in the
// LICENSE file in the root directory of this source tree.

/**
 * Org membership check for Edge Functions — via the Data API.
 *
 * CRITICAL: `app_private.is_org_member` is NOT callable via the Data API
 * (only the `public` schema is exposed via PostgREST). Calling
 * `supabaseUser.rpc('is_org_member', ...)` from an Edge Function returns 404
 * ("Could not find the function ... in the schema cache"), which the callers
 * were treating as a membership denial — every authenticated user got 403
 * from pagbank-connect, vector-rag, settings-cascade and pagbank-order.
 *
 * The correct path is to query `organization_members` directly: the
 * organization's SELECT policy lets a user read their OWN membership row
 * (`member_id = auth.uid()`), so this check works through the Data API with
 * the caller's JWT and stays inside RLS.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Returns true when the authenticated user is a member of the given org.
 * Fails closed (false) on any query error or when no row exists.
 *
 * @param supabaseUser  a supabase-js client authenticated with the USER's JWT
 * @param organizationId  the org to check (untrusted browser input)
 */
export async function isOrgMemberViaDataApi(supabaseUser: SupabaseClient, organizationId: string): Promise<boolean> {
  if (!organizationId) return false;
  try {
    const { data, error } = await supabaseUser
      .from('organization_members')
      .select('organization_id')
      .eq('organization_id', organizationId)
      .limit(1);
    if (error) return false;
    // The SELECT policy only lets the caller see their OWN membership rows,
    // so a returned row for this org proves membership.
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}
