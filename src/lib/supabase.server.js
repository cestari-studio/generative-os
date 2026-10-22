/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createServerClient } from '@supabase/ssr';
import { parseCookies } from '../utils/cookies.js';

const DEFAULT_SUPABASE_URL = 'https://ldjfjmihdvdmltrptngf.supabase.co';
const DEFAULT_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkamZqbWloZHZkbWx0cnB0bmdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTcxMjMsImV4cCI6MjEwNzczMzEyM30.T_Vm0nLTj16O-BUc74kXLiC6H13wlrelciVx_ThFW-c';

/**
 * Creates a request-scoped Supabase SSR client for Express 5 / Vercel SSR.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function createSupabaseServerClient(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_KEY;

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
