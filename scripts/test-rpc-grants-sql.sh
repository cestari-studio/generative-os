#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# Runs the 3 anon-RPC grant assertions against a disposable Postgres (PG 17).
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-rpc_grants_test}"

MIGRATION="supabase/migrations/20261026130100_rpc_grants_remove_anon_excess.sql"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"
echo ">> Applying prerequisites (stub RPCs + pre-fix anon grants)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_rpc_grants.sql
echo ">> Applying grant migration under test"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${MIGRATION}"
echo ">> Running 3 anon-RPC grant assertions"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/rpc_grants_no_anon.sql
echo ">> RPC GRANTS SQL TESTS PASSED"
