/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase.client.js';

/**
 * Reads the normative catalog (products, subproducts, capabilities, platform
 * services) from the backend catalog store (migration
 * 20261022060000_catalog_normative_source + seed).
 *
 * Returns honest backend states instead of fabricating a fallback:
 *   - 'loading'       — query in flight
 *   - 'ready'         — product catalog present in the backend
 *   - 'empty'         — tables are reachable but contain no product records
 *   - 'unprovisioned' — catalog tables are missing
 *   - 'forbidden'     — the current session is not authorized to read the catalog
 *   - 'error'         — an unexpected request or service failure
 *
 * Content comes exclusively from the DB; the static genOsCatalog.js remains
 * the verified static taxonomy reference but is NOT a runtime fallback.
 */
function classifyCatalogError(error) {
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || '');

  if ([401, 403].includes(status) || ['42501'].includes(code)) {
    return 'forbidden';
  }
  if (
    ['42P01'].includes(code) ||
    /relation .* does not exist|could not find the table .* schema cache/i.test(message)
  ) {
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
  const [requestVersion, setRequestVersion] = useState(0);
  const retry = useCallback(() => setRequestVersion((version) => version + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, status: 'loading', error: null }));

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
            status: classifyCatalogError(queryError.error),
            error: queryError.error.message,
          }));
          return;
        }

        const products = Array.isArray(productsRes.data) ? productsRes.data : [];
        const subs = Array.isArray(subsRes.data) ? subsRes.data : [];

        if (products.length === 0) {
          setState((s) => ({ ...s, status: 'empty', error: null }));
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
            status: classifyCatalogError(err),
            error: err instanceof Error ? err.message : 'catalog query failed',
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestVersion]);

  return { ...state, retry };
}
