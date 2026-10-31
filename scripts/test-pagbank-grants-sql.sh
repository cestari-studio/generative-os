#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# Runs the pagbank service_role-only grant assertions against a disposable
# Postgres (PG 17). Env: PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE.
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-pagbank_grants_test}"

MIGRATION="supabase/migrations/20261026130000_pagbank_rpc_service_role_only.sql"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying prerequisites (stub functions + pre-fix anon/authenticated grants)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_pagbank_grants.sql

echo ">> Applying grant migration under test"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${MIGRATION}"

echo ">> Running pagbank service_role-only grant assertions"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/pagbank_service_role_grants.sql

echo ">> PAGBANK GRANTS SQL TESTS PASSED"
