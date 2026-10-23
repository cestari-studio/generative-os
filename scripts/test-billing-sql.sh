#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# Licensed under the Apache-2.0 license found in the LICENSE file in the root
# directory of this source tree.
#
# Runs the billing SQL test suite against a disposable Postgres database.
# Required env (CI provides a postgres service):
#   PGHOST (default 127.0.0.1) PGPORT (default 5432)
#   PGUSER (default postgres)  PGPASSWORD (default postgres)
#   PGDATABASE (default billing_test)
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-billing_test}"

MIGRATION="supabase/migrations/20261022053203_billing_pricebook_usage_metering.sql"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying prerequisites"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq.sql

echo ">> Applying migration under test"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${MIGRATION}"

echo ">> Loading fixtures"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/billing_fixtures.sql

echo ">> Running RLS/pricing assertions as authenticated role"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/billing_pricebook_rls.sql

echo ">> BILLING SQL TESTS PASSED"
