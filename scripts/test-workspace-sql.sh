#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# Runs the workspace-management SQL contract tests against a disposable
# Postgres database. Required env (CI provides a postgres service):
#   PGHOST (default 127.0.0.1) PGPORT (default 5432)
#   PGUSER (default postgres)  PGPASSWORD (default postgres)
#   PGDATABASE (default workspace_test)
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-workspace_test}"

MIGRATION="supabase/migrations/20261023000000_workspace_create_rpc.sql"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying prerequisites (workspace-specific, mirrors real exposure model)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_workspace.sql

echo ">> Applying migration under test"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${MIGRATION}"

echo ">> Running workspace-management assertions as authenticated role"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/workspace_management_rls.sql

echo ">> WORKSPACE SQL TESTS PASSED"
