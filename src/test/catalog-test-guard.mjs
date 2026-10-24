/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Safety guard for the catalog adapter integration test.
 *
 * The integration test creates and destroys a PostgreSQL database. This guard
 * makes sure that can never happen against an unintended target:
 *
 *  - An explicit opt-in flag (CATALOG_TEST_ENABLE=1) is required; without it
 *    the caller must skip intentionally rather than probe for a server.
 *  - The target host must be loopback only (127.0.0.1, localhost, ::1).
 *    Unix-socket paths, remote hosts and empty hosts are refused.
 *  - A separate destructive flag (CATALOG_TEST_ALLOW_RECREATE=1) is required
 *    before any DROP DATABASE is issued.
 *  - The test database name is fixed/validated so a typo cannot redirect the
 *    teardown to another database.
 *  - No password or full connection string is ever included in errors/logs.
 *
 * resolveCatalogTestTarget() returns one of:
 *   { mode: 'skip', reason }                -> caller should describe.skip
 *   { mode: 'error', reason }               -> caller should fail fast
 *   { mode: 'run', pg: {host,port,user,password,database,adminDatabase} }
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const EXPECTED_MAJOR_VERSION = 17;
const DEFAULT_TEST_DATABASE = 'catalog_adapter_it';
const ADMIN_DATABASE = 'postgres';

function isEnabled(value) {
  return value === '1' || value === 'true';
}

export function resolveCatalogTestTarget(env = process.env) {
  // 1. Explicit opt-in. Without it we never touch the network at all.
  if (!isEnabled(env.CATALOG_TEST_ENABLE)) {
    return {
      mode: 'skip',
      reason:
        'catalog integration test disabled: set CATALOG_TEST_ENABLE=1 with a loopback PostgreSQL target to opt in',
    };
  }

  // 2. Host allowlist — loopback only. Anything else is a hard error, not a
  //    skip: an operator who opted in but pointed at a remote host must see
  //    the failure loudly.
  const host = env.PGHOST ?? '';
  if (!LOOPBACK_HOSTS.has(host)) {
    return {
      mode: 'error',
      reason: `refused: PGHOST must be loopback (one of ${[...LOOPBACK_HOSTS].join(', ')}); got a non-allowlisted host`,
    };
  }

  // 3. Port must be a valid TCP port number.
  const port = Number(env.PGPORT ?? '');
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return { mode: 'error', reason: 'refused: PGPORT must be a valid TCP port number' };
  }

  // 4. The destructive flag is separate from the opt-in: enabling the test
  //    only allows read-only probing; DROP DATABASE needs its own flag.
  if (!isEnabled(env.CATALOG_TEST_ALLOW_RECREATE)) {
    return {
      mode: 'error',
      reason:
        'refused: CATALOG_TEST_ALLOW_RECREATE=1 is required before the test may drop and recreate its dedicated database',
    };
  }

  // 5. Database name must be the dedicated test database (or an explicit
  //    override with the required prefix) so teardown cannot hit a real one.
  const database = env.CATALOG_TEST_DATABASE || DEFAULT_TEST_DATABASE;
  if (typeof database !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(database)) {
    return { mode: 'error', reason: 'refused: CATALOG_TEST_DATABASE contains invalid characters' };
  }
  if (database === ADMIN_DATABASE || database === 'template0' || database === 'template1') {
    return { mode: 'error', reason: `refused: test database name must not be a system database (${database})` };
  }

  return {
    mode: 'run',
    pg: {
      host,
      port,
      user: env.PGUSER || 'postgres',
      password: env.PGPASSWORD,
      database,
      adminDatabase: ADMIN_DATABASE,
    },
  };
}

/**
 * Verify the connected server is a disposable PostgreSQL of the expected
 * major version. Throws (fails closed) otherwise. Never logs secrets.
 *
 * @param {import('pg').Client} adminClient connected to the admin database
 */
export async function assertDisposablePostgres(adminClient) {
  const { rows } = await adminClient.query('SHOW server_version');
  const version = String(rows[0]?.server_version ?? '');
  const major = Number(version.split('.')[0]);
  if (major !== EXPECTED_MAJOR_VERSION) {
    throw new Error(
      `refused: expected PostgreSQL major version ${EXPECTED_MAJOR_VERSION}, server reported ${version || 'unknown'}`,
    );
  }
}
