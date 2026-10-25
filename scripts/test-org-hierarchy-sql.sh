#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# Runs the create_organization_hierarchy SECURITY DEFINER assertions against a
# disposable Postgres database (PG 17), as the `authenticated` role with RLS
# enforced. Required env (CI provides a postgres service):
#   PGHOST (default 127.0.0.1) PGPORT (default 5432)
#   PGUSER (default postgres)  PGPASSWORD (default postgres)
#   PGDATABASE (default org_hierarchy_test)
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-org_hierarchy_test}"

MIGRATION="supabase/migrations/20261024000000_org_hierarchy_security_definer_fix.sql"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying prerequisites (full org-hierarchy shapes, mirrors remote exposure model)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_org_hierarchy.sql

echo ">> Applying migration under test"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${MIGRATION}"

echo ">> Running org-hierarchy DEFINER assertions as authenticated role"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/org_hierarchy_definer.sql

echo ">> ORG-HIERARCHY SQL TESTS PASSED"
