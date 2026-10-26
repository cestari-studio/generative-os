#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# Runs the onboarding actor/subject delegation SQL assertions against a
# disposable Postgres (PG 17), as `authenticated` with RLS enforced.
# Applies the base journey-ledger migration first, then the additive
# delegation migration under test. Env (CI provides a postgres service):
#   PGHOST (127.0.0.1) PGPORT (5432) PGUSER (postgres) PGPASSWORD (postgres)
#   PGDATABASE (onboarding_delegation_test)
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-onboarding_delegation_test}"

BASE_MIGRATION="supabase/migrations/20261026120000_journey_ledger_onboarding_runs.sql"
DELEGATION_MIGRATION="supabase/migrations/20261026150000_onboarding_actor_subject_delegation.sql"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying prerequisites"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_onboarding_delegation.sql

echo ">> Applying base journey-ledger migration"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${BASE_MIGRATION}"

echo ">> Applying delegation migration under test"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${DELEGATION_MIGRATION}"

echo ">> Running onboarding-delegation assertions as authenticated role"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/onboarding_delegation_rls.sql

echo ">> ONBOARDING-DELEGATION SQL TESTS PASSED"
