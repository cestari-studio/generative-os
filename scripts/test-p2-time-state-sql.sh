#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# Runs the red-team P2 time/state-integrity SQL assertions against a disposable
# Postgres (PG 17), as `authenticated` with RLS enforced. Applies, in order:
# prerequisites -> journey ledger (120000) -> delegation (150000) -> readiness
# blocked (170000) -> red-team P1 fixes (180000) -> org-scoping (190000) -> the
# P2 migration under test (20261026200000). 190000 IS in the chain: the merged
# resolve_onboarding_readiness (org-scoped + deterministic + clock_timestamp)
# needs the `scope` column it adds, and B's can_complete_step needs its helper.
# Env (CI provides a postgres service):
#   PGHOST (127.0.0.1) PGPORT (5432) PGUSER (postgres) PGPASSWORD (postgres)
#   PGDATABASE (p2_time_state_test)
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-p2_time_state_test}"

BASE_MIGRATION="supabase/migrations/20261026120000_journey_ledger_onboarding_runs.sql"
DELEGATION_MIGRATION="supabase/migrations/20261026150000_onboarding_actor_subject_delegation.sql"
BLOCKED_MIGRATION="supabase/migrations/20261026170000_readiness_blocked_decision.sql"
P1_MIGRATION="supabase/migrations/20261026180000_red_team_p1_fixes.sql"
ORG_MIGRATION="supabase/migrations/20261026190000_readiness_org_scoping.sql"
P2_MIGRATION="supabase/migrations/20261026200000_p2_time_state_integrity.sql"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying prerequisites (delegation + org-context shapes for the merged RPC)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_onboarding_delegation.sql
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_org_shapes.sql

echo ">> Applying base journey-ledger migration"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${BASE_MIGRATION}"

echo ">> Applying delegation migration"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${DELEGATION_MIGRATION}"

echo ">> Applying readiness blocked-decision migration"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${BLOCKED_MIGRATION}"

echo ">> Applying red-team P1-fix migration"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${P1_MIGRATION}"

echo ">> Applying org-scoping migration (merged resolve_onboarding_readiness)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${ORG_MIGRATION}"

echo ">> Applying P2 time/state-integrity migration under test"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${P2_MIGRATION}"

echo ">> Running P2 time/state-integrity assertions as authenticated role"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/p2_time_state_integrity.sql

echo ">> P2 TIME/STATE-INTEGRITY SQL TESTS PASSED"
