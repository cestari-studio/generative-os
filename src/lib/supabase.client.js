/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createBrowserClient } from '@supabase/ssr';

const DEFAULT_SUPABASE_URL = 'https://ldjfjmihdvdmltrptngf.supabase.co';
const DEFAULT_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkamZqbWloZHZkbWx0cnB0bmdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTcxMjMsImV4cCI6MjEwNzczMzEyM30.T_Vm0nLTj16O-BUc74kXLiC6H13wlrelciVx_ThFW-c';

export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_KEY;

let browserClient = null;

/**
 * Returns a singleton Supabase browser client configured for SSR cookie sync.
 */
export function getSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return browserClient;
}
