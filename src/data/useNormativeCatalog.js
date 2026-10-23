/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase.client.js';

/**
 * Reads the normative catalog (products, subproducts, capabilities, and
 * platform services) exclusively from the backend catalog store.
 *
 * Explicit states distinguish loading, provisioned-but-empty, missing schema,
 * authorization denial, and unexpected failures. Static taxonomy constants
 * are never used as runtime fallback content.
 */
export function classifyCatalogQueryError(error) {
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status ?? error?.statusCode);

  if (status === 401 || status === 403 || code === '42501') {
    return 'forbidden';
  }
  if (code === '42P01' || code === 'PGRST205') {
    return 'unprovisioned';
  }
  return 'error';
}
export function useNormativeCatalog() {
  const [state, setState] = useState({
    status: 'loading',
    products: [],
    subproductsByProduct: {},
    capabilities: [],
    platformServices: [],
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const [productsRes, subsRes, capsRes, svcsRes] = await Promise.all([
          supabase.from('catalog_products').select('*').order('key'),
          supabase.from('catalog_subproducts').select('*').order('key'),
          supabase.from('catalog_capabilities').select('*').order('key'),
          supabase.from('catalog_platform_services').select('*').order('key'),
        ]);

        if (cancelled) return;

        const queryError = [productsRes, subsRes, capsRes, svcsRes].find((r) => r.error);
        if (queryError?.error) {
          setState((s) => ({
            ...s,
            status: classifyCatalogQueryError(queryError.error),
            error: queryError.error.message,
          }));
          return;
        }

        const products = Array.isArray(productsRes.data) ? productsRes.data : [];
        const subs = Array.isArray(subsRes.data) ? subsRes.data : [];

        if (products.length === 0) {
          setState((s) => ({
            ...s,
            status: 'empty',
            products: [],
            subproductsByProduct: {},
            capabilities: [],
            platformServices: [],
            error: null,
          }));
          return;
        }

        const subproductsByProduct = {};
        for (const sub of subs) {
          (subproductsByProduct[sub.product_key] ??= []).push(sub);
        }

        setState({
          status: 'ready',
          products,
          subproductsByProduct,
          capabilities: Array.isArray(capsRes.data) ? capsRes.data : [],
          platformServices: Array.isArray(svcsRes.data) ? svcsRes.data : [],
          error: null,
        });
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            status: 'error',
            error: err instanceof Error ? err.message : 'catalog query failed',
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
