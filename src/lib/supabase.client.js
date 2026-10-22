/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase browser client configuration.
 *
 * The target project is defined per environment via Vite env vars; there is
 * no hardcoded project fallback. Missing configuration is a build/startup
 * error, never a silent redirect to a default project.
 */
export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;

let browserClient = null;

/**
 * Returns a singleton Supabase browser client configured for SSR cookie sync.
 * Throws when the environment is not configured — never falls back to a
 * hardcoded project.
 */
export function getSupabaseBrowserClient() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'Supabase client configuration missing: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for this environment.',
    );
  }
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return browserClient;
}
