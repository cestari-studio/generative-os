#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# Concurrency-race test for public.provision_corporate_tenant (Directive Onda
# 1, request-replay + concurrency). Races TWO REAL concurrent psql sessions
# (users A and B) against the SAME identifier, released simultaneously by an
# advisory-lock barrier, then asserts the post-race invariants
# (supabase/tests/provision_tenant_concurrency_race.sql): exactly ONE winner,
# exactly ONE org, no hijack, no double-provisioning. Runs RACE_ITERATIONS
# rounds (distinct identifier per round) to exercise both loser outcomes
# (23505 insert-race conflict and 42501 post-commit takeover denial).
# Local disposable-PG only; NO remote mutation.
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-provision_tenant_race_test}"

MIGRATION="supabase/migrations/20261026140000_provision_corporate_tenant_safe.sql"
RACE_ITERATIONS="${RACE_ITERATIONS:-5}"
BARRIER_LOCK=424242

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"
echo ">> Applying prerequisites"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_provision_tenant.sql
echo ">> Applying migration under test"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${MIGRATION}"

# One racer session: user $1 (uuid), label $2, payload suffix $3, identifier $4.
# Blocks on the advisory barrier until the harness releases it, then calls the
# RPC and records the outcome (NEVER fails the harness: errors are data).
run_racer() {
  local user_uuid="$1" label="$2" suffix="$3" identifier="$4"
  psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=0 <<SQL
\set QUIET on
SELECT pg_advisory_lock(${BARRIER_LOCK});
SELECT pg_advisory_unlock(${BARRIER_LOCK});
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"${user_uuid}","role":"authenticated"}';
SET app.race_racer = '${label}';
SET app.race_identifier = '${identifier}';
SET app.race_suffix = '${suffix}';

DO \$\$
DECLARE
  v_result jsonb;
  v_errcode text := NULL;
  v_outcome text;
BEGIN
  BEGIN
    SELECT public.provision_corporate_tenant(
      'Race Corp ' || current_setting('app.race_suffix'), current_setting('app.race_identifier'),
      'Race Legal ' || current_setting('app.race_suffix'), 'TAX-' || current_setting('app.race_suffix'),
      'BR', 'MICRO', NULL, NULL, NULL, '{}'::jsonb, 'en', 'Core', 'Main'
    ) INTO v_result;
    v_outcome := CASE WHEN (v_result->>'provisioned')::boolean THEN 'provisioned' ELSE 'read_back' END;
  EXCEPTION WHEN OTHERS THEN
    v_outcome := 'error';
    v_errcode := SQLSTATE;
    v_result := NULL;
  END;
  INSERT INTO public.race_results (racer, outcome, errcode, provisioned, organization_id)
  VALUES (current_setting('app.race_racer'), v_outcome, v_errcode,
          COALESCE((v_result->>'provisioned')::boolean, false),
          NULLIF(v_result->>'organization_id', '')::uuid);
END \$\$;
SQL
}

RACE_TMP="$(mktemp -d)"
trap 'rm -rf "${RACE_TMP}"' EXIT

run_round() {
  local round="$1" identifier="race-org-$1"

  echo ">> Round ${round}: resetting race collector + holding the advisory barrier"
  psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 <<SQL
DROP TABLE IF EXISTS public.race_results;
CREATE TABLE public.race_results (
  racer text PRIMARY KEY,
  outcome text NOT NULL,          -- 'provisioned' | 'read_back' | 'error'
  errcode text,
  provisioned boolean,
  organization_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
-- Racers run SET ROLE authenticated and record their own outcome.
GRANT INSERT ON public.race_results TO authenticated;
SQL
  # Hold the barrier for 2s in a background session; the racers block on it and
  # are released simultaneously when this session's sleep ends.
  psql -d "${PGDATABASE}" -q \
    -c "SELECT pg_advisory_lock(${BARRIER_LOCK}); SELECT pg_sleep(2);" \
    >"${RACE_TMP}/barrier-${round}.log" 2>&1 &
  local pid_barrier=$!
  sleep 0.5  # let the barrier session acquire the lock before the racers start

  echo ">> Round ${round}: racing two REAL psql sessions (A vs B) on '${identifier}'"
  run_racer 'aaaaaaaa-0000-0000-0000-000000000001' A A "${identifier}" >"${RACE_TMP}/A-${round}.log" 2>&1 &
  local pid_a=$!
  run_racer 'bbbbbbbb-0000-0000-0000-000000000002' B B "${identifier}" >"${RACE_TMP}/B-${round}.log" 2>&1 &
  local pid_b=$!
  # Racer psql exit codes are NOT harness failures (SQL errors are data).
  wait "${pid_a}" || true
  wait "${pid_b}" || true
  wait "${pid_barrier}" || true

  echo ">> Round ${round}: race outcomes recorded:"
  psql -d "${PGDATABASE}" -c \
    "SELECT racer, outcome, errcode, provisioned, organization_id FROM public.race_results ORDER BY racer;"

  echo ">> Round ${round}: asserting post-race invariants"
  psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 \
    -v race_identifier="${identifier}" \
    -f supabase/tests/provision_tenant_concurrency_race.sql
}

for round in $(seq 1 "${RACE_ITERATIONS}"); do
  run_round "${round}"
done

echo ">> PROVISION-TENANT CONCURRENCY-RACE SQL TESTS PASSED (${RACE_ITERATIONS} rounds x 6 assertions)"
