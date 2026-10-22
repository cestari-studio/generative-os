/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { http, HttpResponse } from 'msw';

export const getRouter = (mocks, networking) => {
  const apiRoute = (verb, path, handler) => {
    const mock = http[verb](path, async ({ request, params }) => {
      const url = new URL(request.url);
      const req = {
        params: params || {},
        query: Object.fromEntries(url.searchParams.entries()),
      };

      let statusCode = 200;
      const res = {
        status: (code) => {
          statusCode = code;
          return res;
        },
        json: (data) => {
          networking.removeRequest(path);
          return HttpResponse.json(data, { status: statusCode });
        },
      };

      networking.addRequests(path);
      return handler(req, res);
    });

    mocks.push(mock);
  };

  return {
    get: (path, ...args) => apiRoute('get', path, args[args.length - 1]),
  };
};
