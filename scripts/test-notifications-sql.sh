#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# Runs the notifications-foundation SQL contract tests against a disposable
# Postgres database. Required env (CI provides a postgres service):
#   PGHOST (default 127.0.0.1) PGPORT (default 5432)
#   PGUSER (default postgres)  PGPASSWORD (default postgres)
#   PGDATABASE (default notifications_test)
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-notifications_test}"

MIGRATION="supabase/migrations/20261023010000_notifications_foundation.sql"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying prerequisites (workspace chain: orgs, persons, members, helpers)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_workspace.sql

echo ">> Applying migration under test"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${MIGRATION}"

echo ">> Seeding test fixture notification (as postgres — client writes are denied)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.notifications (organization_id, recipient_person_id, kind, title, body)
VALUES (
  'aaaaaaaa-0000-4000-8000-0000000000a1',
  '11111111-1111-1111-1111-111111111111',
  'system',
  'Workspace provisioned',
  'Your operations workspace is ready.'
);
SQL

echo ">> Running notifications assertions as authenticated role"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/notifications_rls.sql

echo ">> NOTIFICATIONS SQL TESTS PASSED"
