/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Registers application API routes on the given Express app instance.
 *
 * There are currently no demo/example endpoints: client data comes from
 * Supabase (tables, RPCs and Edge Functions), not from in-process mocks.
 *
 * @param app - Express app instance OR msw router in case of unit testing
 */
export const getRoutes = (app) => {
  // Health probe for SSR smoke checks and deployment verification.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
};
