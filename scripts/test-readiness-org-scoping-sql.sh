#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# Runs the readiness ORG-SCOPING (red-team P1) SQL assertions against a
# disposable Postgres (PG 17), as `authenticated` with RLS enforced.
#
# Two phases:
#   (1) REPRODUCTION — apply migrations up to 180000 (pre-fix) and run the
#       cross-org probe: a completed org-A run must (incorrectly) yield `allow`
#       in org B. This PROVES the leak. The phase asserts the leak EXISTS.
#   (2) FIX — apply the additive 190000 migration and run the full assertion
#       suite (readiness_org_scoping.sql): the same probe must NOT allow.
#
# Applies, in order: _prereq_readiness_org_scoping.sql, 120000, 150000, 170000,
# 180000, then (fix phase) 190000, then 200000 (the merged P2 hardening — so the
# readiness function under test is the FINAL merged org-scoped+deterministic
# body, not an intermediate). Env (CI provides a postgres service):
#   PGHOST (127.0.0.1) PGPORT (5432) PGUSER (postgres) PGPASSWORD (postgres)
#   PGDATABASE (readiness_org_scoping_test)
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-readiness_org_scoping_test}"

BASE_MIGRATION="supabase/migrations/20261026120000_journey_ledger_onboarding_runs.sql"
DELEGATION_MIGRATION="supabase/migrations/20261026150000_onboarding_actor_subject_delegation.sql"
BLOCKED_MIGRATION="supabase/migrations/20261026170000_readiness_blocked_decision.sql"
P1_MIGRATION="supabase/migrations/20261026180000_red_team_p1_fixes.sql"
FIX_MIGRATION="supabase/migrations/20261026190000_readiness_org_scoping.sql"
P2_MIGRATION="supabase/migrations/20261026200000_p2_time_state_integrity.sql"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying prerequisites"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_readiness_org_scoping.sql

echo ">> Applying journey-ledger chain (120000 -> 150000 -> 170000 -> 180000)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${BASE_MIGRATION}"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${DELEGATION_MIGRATION}"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${BLOCKED_MIGRATION}"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${P1_MIGRATION}"

echo ">> PHASE 1: REPRODUCTION of the cross-org leak (pre-fix implementation)"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/readiness_org_scoping_reproduction.sql

echo ">> Applying additive org-scoping fix migration (190000)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${FIX_MIGRATION}"

echo ">> Applying merged P2 time/state-integrity migration (200000)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${P2_MIGRATION}"

echo ">> PHASE 2: running org-scoping assertions as authenticated role (post-fix)"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/readiness_org_scoping.sql

echo ">> READINESS ORG-SCOPING SQL TESTS PASSED"
