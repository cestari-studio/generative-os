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
import { baseUrl } from '../config/server-config.js';

const _setupServer = (...args) => {
  const mocks = [];
  const networking = getNetworking();

  // Set up internal API routes (including external mock routes)
  getRoutes(getRouter(mocks, networking));

  // Mock external API calls from postHandlers to our local external endpoints
  // These intercept the fetch calls made by postHandlers.js
  const externalMocks = [
    http.get(`${baseUrl}/api/external/post/:id`, ({ params }) => {
      return HttpResponse.json({
        id: params.id,
        title: 'Test post title',
        body: 'Test post body content',
        userId: 1,
      });
    }),
    http.get(`${baseUrl}/api/external/comments`, ({ request }) => {
      const url = new URL(request.url);
      const postId = url.searchParams.get('postId');
      return HttpResponse.json([
        {
          id: 1,
          postId: parseInt(postId),
          name: 'Test comment 1',
          email: 'test1@example.com',
          body: 'Test comment 1 body',
        },
        {
          id: 2,
          postId: parseInt(postId),
          name: 'Test comment 2',
          email: 'test2@example.com',
          body: 'Test comment 2 body',
        },
      ]);
    }),
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
