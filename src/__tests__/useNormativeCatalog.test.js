/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import { classifyCatalogQueryError } from '../data/useNormativeCatalog.js';

describe('classifyCatalogQueryError', () => {
  it.each([
    {
      label: 'missing SQL relation',
      error: { code: '42P01', message: 'missing table' },
      expected: 'unprovisioned',
    },
    {
      label: 'missing PostgREST table',
      error: { code: 'PGRST205', message: 'table not in schema cache' },
      expected: 'unprovisioned',
    },
    {
      label: 'SQL permission denial',
      error: { code: '42501', message: 'permission denied' },
      expected: 'forbidden',
    },
    {
      label: 'unauthenticated request',
      error: { status: 401, message: 'unauthorized' },
      expected: 'forbidden',
    },
    {
      label: 'forbidden request',
      error: { status: 403, message: 'forbidden' },
      expected: 'forbidden',
    },
    {
      label: 'connection failure',
      error: { code: 'ECONNRESET', message: 'connection reset' },
      expected: 'error',
    },
    {
      label: 'unknown backend error',
      error: { message: 'unknown backend error' },
      expected: 'error',
    },
  ])('classifies $label as $expected', ({ error, expected }) => {
    expect(classifyCatalogQueryError(error)).toBe(expected);
  });
});
