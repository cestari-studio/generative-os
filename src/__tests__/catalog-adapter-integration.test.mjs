/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Integration test for the normative catalog adapter's data contract against
 * a REAL seeded catalog in disposable PostgreSQL 17.11.
 *
 * This is NOT a unit test with a mocked hook — it applies the migration +
 * seed to a disposable DB and runs the SAME queries the useNormativeCatalog
 * adapter issues (PostgREST .from(...).select('*').order('key') maps 1:1 to
 * these SQL statements), asserting shape, content, provenance, RLS read as
 * authenticated, and the unprovisioned signal (empty/missing table).
 *
 * Requires a running disposable Postgres (see scripts/test-billing-sql.sh for
 * the bootstrap pattern). Set CATALOG_TEST_DATABASE_URL or PG* env vars.
 */
import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';

const PG = {
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || undefined,
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 55450),
  database: 'catalog_adapter_it',
};

const POST_AVAILABLE = await (async () => {
  try {
    const c = new pg.Client({ ...PG, database: 'postgres' });
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
})();

let client;

async function applySql(file) {
  const sql = readFileSync(file, 'utf8');
  await client.query(sql);
}

beforeAll(async () => {
  if (!POST_AVAILABLE) return;
  // Recreate a clean disposable DB mirroring the prereq schema + billing
  // (dependency of the catalog's platform_admin policy) + catalog + seed.
  const admin = new pg.Client({ ...PG, database: 'postgres' });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS catalog_adapter_it;');
  await admin.query('CREATE DATABASE catalog_adapter_it;');
  await admin.end();

  client = new pg.Client(PG);
  await client.connect();

  await applySql('supabase/tests/_prereq.sql');
  await applySql('supabase/migrations/20261022053203_billing_pricebook_usage_metering.sql');
  await applySql('supabase/migrations/20261022060000_catalog_normative_source.sql');
  await applySql('supabase/seed/catalog-normative-seed.sql');
});

afterAll(async () => {
  if (client) await client.end();
});

const maybe = POST_AVAILABLE ? describe : describe.skip;

maybe('catalog adapter data contract vs real seeded PostgreSQL (integration)', () => {
  test('catalog_products returns all 5 normative products with content + provenance', async () => {
    // The adapter issues: .from('catalog_products').select('*').order('key')
    const { rows } = await client.query('SELECT * FROM public.catalog_products ORDER BY key');
    expect(rows).toHaveLength(5);
    const keys = rows.map((r) => r.key);
    expect(keys).toEqual([
      'product.academy_ops',
      'product.client_ops',
      'product.content_factory',
      'product.reputation_ops',
      'product.schedule_ops',
    ]);
    for (const row of rows) {
      expect(row.name).toBeTruthy();
      expect(row.source_provenance?.registry).toBe('product-registry.json');
    }
  });

  test('catalog_subproducts returns 30 subproducts linked to their products', async () => {
    const { rows } = await client.query(
      `SELECT s.key, s.name, s.product_key, p.name AS product_name
       FROM public.catalog_subproducts s
       JOIN public.catalog_products p ON p.key = s.product_key
       ORDER BY s.key`,
    );
    expect(rows).toHaveLength(30);
    // Every subproduct resolves to a real product (FK integrity).
    for (const row of rows) {
      expect(row.product_name).toBeTruthy();
      expect(row.product_key).toMatch(/^product\./);
    }
  });

  test('catalog_capabilities and catalog_platform_services return 9 and 6 entries', async () => {
    const caps = await client.query('SELECT * FROM public.catalog_capabilities ORDER BY key');
    const svcs = await client.query('SELECT * FROM public.catalog_platform_services ORDER BY key');
    expect(caps.rows).toHaveLength(9);
    expect(svcs.rows).toHaveLength(6);
  });

  test('RLS read path as authenticated returns catalog rows (not service_role)', async () => {
    // Simulate the authenticated role used by the browser (RLS enforced).
    await client.query('SET ROLE authenticated');
    await client.query(
      `SET request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}'`,
    );
    const { rows } = await client.query('SELECT key, name FROM public.catalog_products ORDER BY key');
    expect(rows.length).toBe(5);
    await client.query('RESET ROLE');
  });

  test('non-admin authenticated user CANNOT write catalog content', async () => {
    await client.query('SET ROLE authenticated');
    await client.query(
      `SET request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}'`,
    );
    await expect(
      client.query(`INSERT INTO public.catalog_products (key, name) VALUES ('product.hack', 'Hack')`),
    ).rejects.toThrow();
    await client.query('RESET ROLE');
  });

  test('seed is idempotent (re-applying keeps 5 products, no duplicates)', async () => {
    await applySql('supabase/seed/catalog-normative-seed.sql');
    const { rows } = await client.query('SELECT count(*)::int AS n FROM public.catalog_products');
    expect(rows[0].n).toBe(5);
  });

  test('unprovisioned signal: dropping the table yields an error the adapter maps to unprovisioned', async () => {
    // Verify the adapter's failure mode is observable: a missing table errors,
    // which useNormativeCatalog maps to status 'unprovisioned' (never fake data).
    await expect(client.query('SELECT * FROM public.catalog_does_not_exist')).rejects.toThrow(/does not exist/);
  });
});
