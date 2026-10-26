#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# REAL two-session concurrency race for the optimistic `revision` column on
# public.onboarding_step_states — NOT a single DO block. Two independent psql
# connections race the SAME row:
#
#   Session A (winner):  BEGIN; UPDATE ... WHERE revision = 1  (holds the row
#                        lock, uncommitted) ... COMMIT -> revision becomes 2.
#   Session B (stale):   UPDATE ... WHERE revision = 1  (stale read of the same
#                        row). It BLOCKS on A's row lock; once A commits, the
#                        predicate no longer matches (revision is now 2), so the
#                        UPDATE affects 0 rows — the lost update is prevented and
#                        A's conclusion is NOT silently overwritten.
#   Session C (fresh):   UPDATE ... WHERE revision = 2  (current) -> succeeds,
#                        revision becomes 3. Proves a current-revision writer
#                        still makes progress after the race.
#
# Env: PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE (a disposable DB where the two
# journey-ledger migrations have already been applied by the caller).
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-readiness_blocked_test}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

UID1="11111111-1111-1111-1111-111111111111"

echo ">> [race] seeding run + step row (revision 1) in ${PGDATABASE}"
RUN_ID="$(psql -d "${PGDATABASE}" -At <<'SQL'
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
INSERT INTO public.onboarding_runs (wizard_key, actor_id, subject_user_id, idempotency_key)
VALUES ('onboarding.tenant', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'race-run-1')
RETURNING id;
SQL
)"
RUN_ID="$(echo "${RUN_ID}" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n1)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 <<SQL
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"${UID1}","role":"authenticated"}';
INSERT INTO public.onboarding_step_states (run_id, step_key, state)
VALUES ('${RUN_ID}', 'onboarding.tenant.identity', 'in_progress');
SQL
echo ">> [race] run_id=${RUN_ID}; step row at revision 1"

# --- Session A: winner holds the row lock inside an open transaction ---------
cat > "${WORKDIR}/sessionA.sql" <<SQL
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"${UID1}","role":"authenticated"}';
BEGIN;
UPDATE public.onboarding_step_states
   SET state = 'completed', completed_at = now(), revision = revision + 1,
       verified_at = now(), validation_state = 'verified'
 WHERE run_id = '${RUN_ID}' AND step_key = 'onboarding.tenant.identity' AND revision = 1;
SELECT 'A_HOLDING_LOCK';
SELECT pg_sleep(3);
COMMIT;
SELECT 'A_COMMITTED';
SQL

# --- Session B: stale writer, blocks on A's lock, then matches 0 rows --------
cat > "${WORKDIR}/sessionB.sql" <<SQL
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"${UID1}","role":"authenticated"}';
SELECT 'B_ATTEMPTING_STALE_UPDATE';
UPDATE public.onboarding_step_states
   SET state = 'invalid', error_code = 'stale_overwrite_attempt', revision = revision + 1
 WHERE run_id = '${RUN_ID}' AND step_key = 'onboarding.tenant.identity' AND revision = 1;
SQL

echo ">> [race] launching session A (background, holds lock)"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f "${WORKDIR}/sessionA.sql" > "${WORKDIR}/A.log" 2>&1 &
A_PID=$!

# Give A a moment to take the row lock.
sleep 1

echo ">> [race] launching session B (stale update, will block then affect 0 rows)"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f "${WORKDIR}/sessionB.sql" > "${WORKDIR}/B.log" 2>&1 &
B_PID=$!

wait "${A_PID}"
wait "${B_PID}"

echo ">> [race] session A output:"; sed 's/^/     A| /' "${WORKDIR}/A.log"
echo ">> [race] session B output:"; sed 's/^/     B| /' "${WORKDIR}/B.log"

# Session B must NOT report an UPDATE count of 1. psql echoes the command tag
# (e.g. "UPDATE 0"); a stale lost-update would echo "UPDATE 1".
if grep -q "UPDATE 1" "${WORKDIR}/B.log"; then
  echo "!! [race] FAILED: stale session B overwrote the row (UPDATE 1) — LOST UPDATE" >&2
  exit 1
fi
if ! grep -q "UPDATE 0" "${WORKDIR}/B.log"; then
  echo "!! [race] FAILED: stale session B did not report UPDATE 0" >&2
  sed 's/^/     B| /' "${WORKDIR}/B.log" >&2
  exit 1
fi
echo ">> [race] PASS: stale-revision session B affected 0 rows (no lost update)"

# A committed its conclusion: state completed, revision 2, and NOT B's stale payload.
FINAL="$(psql -d "${PGDATABASE}" -At -c "SELECT state || '|' || revision || '|' || COALESCE(error_code,'<null>') FROM public.onboarding_step_states WHERE run_id = '${RUN_ID}' AND step_key = 'onboarding.tenant.identity';")"
echo ">> [race] post-race row: ${FINAL}"
[ "${FINAL}" = "completed|2|<null>" ] || { echo "!! [race] FAILED: A's conclusion was overwritten: ${FINAL}" >&2; exit 1; }
echo ">> [race] PASS: winner's conclusion preserved (state=completed, revision=2, no stale error_code)"

# --- Session C: a CURRENT-revision writer still makes progress ---------------
C_OUT="$(psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 <<SQL
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"${UID1}","role":"authenticated"}';
UPDATE public.onboarding_step_states
   SET validation_state = 'revalidated', revision = revision + 1
 WHERE run_id = '${RUN_ID}' AND step_key = 'onboarding.tenant.identity' AND revision = 2;
SQL
)"
echo "${C_OUT}" | grep -q "UPDATE 1" || { echo "!! [race] FAILED: fresh-revision session C did not update 1 row" >&2; echo "${C_OUT}" >&2; exit 1; }
FINAL2="$(psql -d "${PGDATABASE}" -At -c "SELECT revision FROM public.onboarding_step_states WHERE run_id = '${RUN_ID}' AND step_key = 'onboarding.tenant.identity';")"
[ "${FINAL2}" = "3" ] || { echo "!! [race] FAILED: expected revision 3 after fresh write, got ${FINAL2}" >&2; exit 1; }
echo ">> [race] PASS: fresh-revision session C succeeded (revision 2 -> 3)"

echo ">> READINESS TWO-SESSION CONCURRENCY RACE PASSED"
