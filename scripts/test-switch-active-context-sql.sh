#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# Licensed under the Apache-2.0 license found in the LICENSE file in the root
# directory of this source tree.
#
# Exercises switch_active_context hierarchy validation on disposable Postgres
# as authenticated with RLS enforced.
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-switch_context_hierarchy_test}"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying prerequisites and hierarchy fix"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_switch_active_context_hierarchy.sql
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261026220000_validate_active_context_hierarchy.sql

echo ">> Running authenticated RLS assertions"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/switch_active_context_hierarchy.sql

echo ">> SWITCH ACTIVE CONTEXT HIERARCHY SQL TESTS PASSED"
