/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { getNetworking } from './networking';
import { getRouter } from './router';
import { getRoutes } from '../routes/routes';

const _setupServer = (...args) => {
  const mocks = [];
  const networking = getNetworking();

  // Set up internal API routes
  getRoutes(getRouter(mocks, networking));

  // Backend calls go to Supabase; tests intercept them at the network edge.
  const externalMocks = [
    http.get('https://*.supabase.co/rest/v1/*', () => HttpResponse.json([])),
    http.post('https://*.supabase.co/rest/v1/rpc/*', () => HttpResponse.json([])),
    http.get('https://*.supabase.co/auth/v1/*', () => HttpResponse.json({ user: null, session: null })),
    http.post('https://*.supabase.co/functions/v1/*', () => HttpResponse.json({ status: 'ok', matches: [] })),
  ];

  const server = setupServer(...mocks, ...externalMocks, ...args);
  server.networking = networking;
  return server;
};

export const server = _setupServer();
