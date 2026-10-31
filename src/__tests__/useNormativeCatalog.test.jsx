/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { getSupabaseBrowserClient } from '../lib/supabase.client.js';
import { useNormativeCatalog } from '../data/useNormativeCatalog.js';

vi.mock('../lib/supabase.client.js', () => ({
  getSupabaseBrowserClient: vi.fn(),
}));

const products = [{ key: 'product.example', name: 'Example' }];

function createClient(getResult) {
  return {
    from: vi.fn((table) => ({
      select: () => ({
        order: async () => getResult(table),
      }),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

test('keeps transient catalog query failures separate from an unprovisioned catalog', async () => {
  getSupabaseBrowserClient.mockReturnValue(
    createClient(() => ({ data: null, error: { code: '42501', message: 'permission denied' } })),
  );

  const { result } = renderHook(() => useNormativeCatalog());

  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.error).toBe('permission denied');
});

test('reports a missing catalog table as unprovisioned', async () => {
  getSupabaseBrowserClient.mockReturnValue(
    createClient(() => ({
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'public.catalog_products'" },
    })),
  );

  const { result } = renderHook(() => useNormativeCatalog());

  await waitFor(() => expect(result.current.status).toBe('unprovisioned'));
});

test('retry runs the catalog queries again and can recover to ready', async () => {
  let shouldFail = true;
  const client = createClient((table) => {
    if (shouldFail) return { data: null, error: { code: 'ECONNRESET', message: 'network unavailable' } };
    if (table === 'catalog_products') return { data: products, error: null };
    return { data: [], error: null };
  });
  getSupabaseBrowserClient.mockReturnValue(client);

  const { result } = renderHook(() => useNormativeCatalog());
  await waitFor(() => expect(result.current.status).toBe('error'));

  shouldFail = false;
  await act(async () => result.current.retry());

  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.products).toEqual(products);
  expect(client.from).toHaveBeenCalledTimes(8);
});
