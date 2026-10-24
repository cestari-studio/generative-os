#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# Licensed under the Apache-2.0 license found in the LICENSE file in the root
# directory of this source tree.
#
# CI variant of the Phase 2 SQL suite: applies the candidate migrations, both
# vendored seeds (normative catalog + registry allowlist), and the RLS /
# validation assertions — WITHOUT the genOS importer step (which needs a local
# genOS reference clone and runs in the full local suite test-phase2-sql.sh).
#
# Required env (CI provides a postgres service):
#   PGHOST (default 127.0.0.1) PGPORT (default 5432)
#   PGUSER (default postgres)  PGPASSWORD (default postgres)
#   PGDATABASE (default phase2_test)
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-phase2_test}"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying Phase 2 prerequisites (mirrors)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_phase2.sql

echo ">> Applying candidate migrations"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261023120000_normative_catalog_registries.sql
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261023120100_web_surface_configuration.sql

echo ">> Re-applying migrations (idempotency of the migration path)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261023120000_normative_catalog_registries.sql
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261023120100_web_surface_configuration.sql

echo ">> Seeding normative catalog (vendored, 844 upserts)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/seed/normative-catalog-seed.sql

echo ">> Seeding registry allowlist (vendored, 72 entries)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/seed/registry-allowlist.sql

echo ">> Running RLS/validation assertions"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/phase2_normative_surface_tests.sql

echo ">> PHASE 2 SQL TESTS PASSED (CI variant — no genOS importer step)"
