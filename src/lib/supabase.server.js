/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createServerClient } from '@supabase/ssr';
import { parseCookies } from '../utils/cookies.js';

/**
 * Creates a request-scoped Supabase SSR client for Express 5 / Vercel SSR.
 *
 * Configuration is environment-driven; there is no hardcoded project
 * fallback. Missing configuration is a startup error.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function createSupabaseServerClient(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase server configuration missing: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for this environment.',
    );
  }

  const parsedCookies = parseCookies(req?.headers?.cookie || '');

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return Object.entries(parsedCookies).map(([name, value]) => ({
          name,
          value,
        }));
      },
      setAll(cookiesToSet) {
        if (!res || res.headersSent) return;
        cookiesToSet.forEach(({ name, value, options }) => {
          if (typeof res.cookie === 'function') {
            res.cookie(name, value, options);
          }
        });
      },
    },
  });
}
