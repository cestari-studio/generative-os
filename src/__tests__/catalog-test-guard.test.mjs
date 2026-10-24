/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Unit tests for the catalog integration test safety guard. These run
 * everywhere (no PostgreSQL needed) and prove the guard fails closed:
 * no opt-in -> skip; non-loopback host -> error; no recreate flag -> error;
 * system database name -> error; valid local config -> run.
 */
import { test, expect, describe } from 'vitest';
import { resolveCatalogTestTarget } from '../test/catalog-test-guard.mjs';

const VALID_BASE = {
  CATALOG_TEST_ENABLE: '1',
  CATALOG_TEST_ALLOW_RECREATE: '1',
  PGHOST: '127.0.0.1',
  PGPORT: '5432',
  PGUSER: 'postgres',
  PGPASSWORD: 'postgres',
};

describe('catalog test safety guard', () => {
  test('skips intentionally when CATALOG_TEST_ENABLE is not set', () => {
    const result = resolveCatalogTestTarget({});
    expect(result.mode).toBe('skip');
    expect(result.reason).toMatch(/CATALOG_TEST_ENABLE=1/);
  });

  test('skips when CATALOG_TEST_ENABLE is not exactly 1/true', () => {
    for (const value of ['0', 'yes', 'on', '']) {
      expect(resolveCatalogTestTarget({ ...VALID_BASE, CATALOG_TEST_ENABLE: value }).mode).toBe('skip');
    }
  });

  test('refuses non-loopback hosts (fail closed, not skip)', () => {
    for (const host of ['192.168.1.10', 'db.internal', 'example.com', '', '/var/run/postgresql']) {
      const result = resolveCatalogTestTarget({ ...VALID_BASE, PGHOST: host });
      expect(result.mode).toBe('error');
      expect(result.reason).toMatch(/loopback/);
    }
  });

  test('accepts the loopback allowlist', () => {
    for (const host of ['127.0.0.1', 'localhost', '::1']) {
      const result = resolveCatalogTestTarget({ ...VALID_BASE, PGHOST: host });
      expect(result.mode).toBe('run');
      expect(result.pg.host).toBe(host);
    }
  });

  test('refuses invalid ports', () => {
    for (const port of ['0', '-1', '70000', 'abc', '']) {
      expect(resolveCatalogTestTarget({ ...VALID_BASE, PGPORT: port }).mode).toBe('error');
    }
  });

  test('refuses to run without the destructive recreate flag', () => {
    const { CATALOG_TEST_ALLOW_RECREATE, ...noRecreate } = VALID_BASE;
    const result = resolveCatalogTestTarget({ ...noRecreate, CATALOG_TEST_ALLOW_RECREATE: '0' });
    expect(result.mode).toBe('error');
    expect(result.reason).toMatch(/CATALOG_TEST_ALLOW_RECREATE=1/);
  });

  test('refuses system database names as the test database', () => {
    for (const database of ['postgres', 'template0', 'template1']) {
      const result = resolveCatalogTestTarget({ ...VALID_BASE, CATALOG_TEST_DATABASE: database });
      expect(result.mode).toBe('error');
      expect(result.reason).toMatch(/system database/);
    }
  });

  test('refuses invalid database name characters', () => {
    for (const database of ['db;DROP', 'db name', 'db-name', '1db']) {
      expect(resolveCatalogTestTarget({ ...VALID_BASE, CATALOG_TEST_DATABASE: database }).mode).toBe('error');
    }
  });

  test('empty database name falls back to the dedicated default (never a system db)', () => {
    const result = resolveCatalogTestTarget({ ...VALID_BASE, CATALOG_TEST_DATABASE: '' });
    expect(result.mode).toBe('run');
    expect(result.pg.database).toBe('catalog_adapter_it');
  });

  test('defaults to the dedicated test database name', () => {
    const result = resolveCatalogTestTarget(VALID_BASE);
    expect(result.mode).toBe('run');
    expect(result.pg.database).toBe('catalog_adapter_it');
    expect(result.pg.adminDatabase).toBe('postgres');
  });

  test('never includes the password in any error or skip reason', () => {
    const cases = [
      resolveCatalogTestTarget({}),
      resolveCatalogTestTarget({ ...VALID_BASE, PGHOST: 'remote.db' }),
      resolveCatalogTestTarget({ ...VALID_BASE, CATALOG_TEST_ALLOW_RECREATE: '0' }),
    ];
    for (const result of cases) {
      expect(JSON.stringify(result)).not.toContain(VALID_BASE.PGPASSWORD);
    }
  });
});
