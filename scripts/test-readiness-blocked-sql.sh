#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# Runs the readiness `blocked`-decision + 'onboarding.tenant' SQL assertions
# against a disposable Postgres (PG 17), as `authenticated` with RLS enforced.
# Applies BOTH journey-ledger migrations (20261026120000 then the additive
# 20261026170000 that introduces `blocked` + seeds the tenant definition).
# Env (CI provides a postgres service):
#   PGHOST (127.0.0.1) PGPORT (5432) PGUSER (postgres) PGPASSWORD (postgres)
#   PGDATABASE (readiness_blocked_test)
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-readiness_blocked_test}"

BASE_MIGRATION="supabase/migrations/20261026120000_journey_ledger_onboarding_runs.sql"
BLOCKED_MIGRATION="supabase/migrations/20261026170000_readiness_blocked_decision.sql"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying prerequisites"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_journey_ledger.sql

echo ">> Applying base journey-ledger migration"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${BASE_MIGRATION}"

echo ">> Applying additive blocked-decision migration under test"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${BLOCKED_MIGRATION}"

echo ">> Running readiness blocked/tenant assertions as authenticated role"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/readiness_blocked_concurrency.sql

echo ">> READINESS BLOCKED SQL TESTS PASSED"
