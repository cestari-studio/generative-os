#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# Runs the legacy create_or_update_corporate_tenant restriction assertions
# (Stage-1 scope correction) against a disposable Postgres (PG 17). Applies the
# rpc-grants prereq (stubs the 3 RPCs + the provision_corporate_tenant successor
# with live pre-fix grants), then the 130100 anon-revocation, then the 210000
# legacy-restrict migration under test. Env (CI provides a postgres service):
#   PGHOST (127.0.0.1) PGPORT (5432) PGUSER (postgres) PGPASSWORD (postgres)
#   PGDATABASE (legacy_corporate_restrict_test)
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-legacy_corporate_restrict_test}"

ANON_MIGRATION="supabase/migrations/20261026130100_rpc_grants_remove_anon_excess.sql"
RESTRICT_MIGRATION="supabase/migrations/20261026210000_legacy_corporate_tenant_restrict.sql"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying rpc-grants prerequisites (behavioral legacy stub + live pre-fix grants, hardened policy surface)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -v alter_policies=false \
  -f supabase/tests/_prereq_rpc_grants.sql

echo ">> Applying the takeover-safe provision RPC (20261026140000 — C5 runs the REAL body)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261026140000_provision_corporate_tenant_safe.sql

echo ">> Applying 130100 anon-revocation (Stage-1 baseline state)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${ANON_MIGRATION}"

echo ">> Applying 210000 legacy-restrict migration under test"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${RESTRICT_MIGRATION}"

echo ">> Running legacy-restrict assertions"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/legacy_corporate_tenant_restrict.sql

echo ">> LEGACY CORPORATE-TENANT RESTRICT SQL TESTS PASSED"
