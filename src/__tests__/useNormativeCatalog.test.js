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
    [{ code: '42P01', message: 'missing table' }, 'unprovisioned'],
    [{ code: 'PGRST205', message: 'table not in schema cache' }, 'unprovisioned'],
    [{ code: '42501', message: 'permission denied' }, 'forbidden'],
    [{ status: 401, message: 'unauthorized' }, 'forbidden'],
    [{ status: 403, message: 'forbidden' }, 'forbidden'],
    [{ code: 'ECONNRESET', message: 'connection reset' }, 'error'],
    [{ message: 'unknown backend error' }, 'error'],
  ])('classifies backend failure %j as %s', (error, expected) => {
    expect(classifyCatalogQueryError(error)).toBe(expected);
  });
});
