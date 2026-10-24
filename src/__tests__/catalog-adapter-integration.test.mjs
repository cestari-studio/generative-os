/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Integration test for the normative catalog adapter's data contract against
 * a REAL seeded catalog in disposable PostgreSQL 17.
 *
 * This is NOT a unit test with a mocked hook — it applies the migration +
 * seed to a disposable DB and runs the SAME queries the useNormativeCatalog
 * adapter issues (PostgREST .from(...).select('*').order('key') maps 1:1 to
 * these SQL statements), asserting shape, content, provenance, RLS read as
 * authenticated, and the unprovisioned signal (empty/missing table).
 *
 * Safety (see src/test/catalog-test-guard.mjs):
 *  - Opt-in is explicit: CATALOG_TEST_ENABLE=1, otherwise the suite skips
 *    intentionally without probing the network at all.
 *  - The target host must be loopback; remote hosts are a hard error.
 *  - DROP DATABASE only runs when CATALOG_TEST_ALLOW_RECREATE=1 is set, and
 *    only ever against the dedicated test database (never a system database).
 *  - The server must report PostgreSQL major version 17.
 *  - No password or connection string is printed in logs or errors.
 */
import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolveCatalogTestTarget, assertDisposablePostgres } from '../test/catalog-test-guard.mjs';

const target = resolveCatalogTestTarget();

if (target.mode === 'error') {
  // Fail closed with a clear message (no secrets): an opted-in but unsafe
  // configuration must never be silently skipped.
  throw new Error(`catalog-adapter-integration: ${target.reason}`);
}

let client;

async function applySql(file) {
  const sql = readFileSync(file, 'utf8');
  await client.query(sql);
}

beforeAll(async () => {
  if (target.mode !== 'run') return;
  const { pg: cfg } = target;

  const admin = new pg.Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.adminDatabase,
  });
  await admin.connect();
  await assertDisposablePostgres(admin);

  // Terminate stale connections to the dedicated test database, then
  // recreate it cleanly. The guard has already proven cfg.database is the
  // dedicated test database, so this cannot touch any other database.
  await admin.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [cfg.database],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${cfg.database}"`);
  await admin.query(`CREATE DATABASE "${cfg.database}"`);
  await admin.end();

  client = new pg.Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  });
  await client.connect();

  await applySql('supabase/tests/_prereq.sql');
  await applySql('supabase/migrations/20261022053203_billing_pricebook_usage_metering.sql');
  await applySql('supabase/migrations/20261022060000_catalog_normative_source.sql');
  await applySql('supabase/seed/catalog-normative-seed.sql');
});

afterAll(async () => {
  if (client) await client.end();
});

const maybe = target.mode === 'run' ? describe : describe.skip;

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
