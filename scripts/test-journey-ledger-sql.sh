#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# Runs the journey-ledger SQL assertions against a disposable Postgres (PG 17),
# as `authenticated` with RLS enforced. Env (CI provides a postgres service):
#   PGHOST (127.0.0.1) PGPORT (5432) PGUSER (postgres) PGPASSWORD (postgres)
#   PGDATABASE (journey_ledger_test)
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-journey_ledger_test}"

MIGRATION="supabase/migrations/20261026120000_journey_ledger_onboarding_runs.sql"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying prerequisites"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_journey_ledger.sql

echo ">> Applying migration under test"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${MIGRATION}"

echo ">> Running journey-ledger assertions as authenticated role"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/journey_ledger_rls.sql

echo ">> JOURNEY-LEDGER SQL TESTS PASSED"
