/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase.client.js';

/**
 * Reads the normative catalog (products, subproducts, capabilities, platform
 * services) from the backend catalog store (migration
 * 20261022060000_catalog_normative_source + seed).
 *
 * Returns an honest provisioning state instead of fabricating a fallback:
 *   - 'loading'  — query in flight
 *   - 'ready'    — catalog present in the backend
 *   - 'unprovisioned' — the catalog store is not provisioned (tables missing
 *     or empty); the caller renders the factual empty state, never a fake.
 *
 * Content comes exclusively from the DB; the static genOsCatalog.js remains
 * the verified static taxonomy reference but is NOT a runtime fallback.
 */
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
          setState((s) => ({ ...s, status: 'unprovisioned', error: queryError.error.message }));
          return;
        }

        const products = Array.isArray(productsRes.data) ? productsRes.data : [];
        const subs = Array.isArray(subsRes.data) ? subsRes.data : [];

        if (products.length === 0) {
          setState((s) => ({ ...s, status: 'unprovisioned' }));
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
            status: 'unprovisioned',
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
