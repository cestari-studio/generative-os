#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# Runs the safe-provisioning SQL assertions against a disposable Postgres (PG 17).
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-provision_tenant_test}"

MIGRATION="supabase/migrations/20261026140000_provision_corporate_tenant_safe.sql"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"
echo ">> Applying prerequisites"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f supabase/tests/_prereq_provision_tenant.sql
echo ">> Applying migration under test"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${MIGRATION}"
echo ">> Running safe-provisioning assertions"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/provision_tenant_safe.sql
echo ">> PROVISION-TENANT SQL TESTS PASSED"
