#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# Licensed under the Apache-2.0 license found in the LICENSE file in the root
# directory of this source tree.
#
# Runs the Phase 2 normative catalog + web surface SQL suite against a
# disposable Postgres database.
# Required env (CI provides a postgres service):
#   PGHOST (default 127.0.0.1) PGPORT (default 5432)
#   PGUSER (default postgres)  PGPASSWORD (default postgres)
#   PGDATABASE (default phase2_test)
#   GENOS_REFERENCE_PATH (path to a local read-only genOS clone at the pinned
#     SHA — required for the importer steps)
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-phase2_test}"

if [[ "${PGHOST}" == /* ]]; then
  # Unix socket host — must be passed as a query parameter, not in authority.
  DSN="postgresql://${PGUSER}@localhost:${PGPORT}/${PGDATABASE}?host=${PGHOST}"
else
  DSN="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}"
fi

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying Phase 2 prerequisites (mirrors)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_phase2.sql

echo ">> Applying candidate migrations"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261023120000_normative_catalog_registries.sql
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261023120100_web_surface_configuration.sql

echo ">> Re-applying migrations (idempotency of the migration path where supported)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261023120000_normative_catalog_registries.sql
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261023120100_web_surface_configuration.sql

echo ">> Seeding registry allowlist (generated mirror of the code registries)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/seed/registry-allowlist.sql

echo ">> Running normative catalog importer against the disposable DB (run 1)"
node scripts/import-normative-catalog.mjs --source "${GENOS_REFERENCE_PATH:?set GENOS_REFERENCE_PATH}" --dsn "${DSN}" --apply
cp docs/phase2-importer-report.json /tmp/phase2-importer-report-run1.json

echo ">> Running importer again — second run must be a no-op (all unchanged)"
node scripts/import-normative-catalog.mjs --source "${GENOS_REFERENCE_PATH}" --dsn "${DSN}" --apply
node -e "
const r = require('./docs/phase2-importer-report.json');
const u = r.diff.unchanged || {};
const ins = r.diff.inserted || {};
const ch = r.diff.changed || {};
const total = Object.values(u).reduce((a, b) => a + b, 0);
const insertedTotal = Object.values(ins).reduce((a, b) => a + b, 0);
const changedTotal = Object.values(ch).reduce((a, b) => a + b, 0);
if (total !== 844 || insertedTotal !== 0 || changedTotal !== 0) {
  console.error('FAIL: importer second run is not a no-op', { unchanged: u, inserted: ins, changed: ch });
  process.exit(1);
}
console.log('PASS: importer second run is a no-op (844/844 unchanged)');
"

echo ">> Running RLS/validation assertions"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/phase2_normative_surface_tests.sql

echo ">> PHASE 2 SQL TESTS PASSED"
