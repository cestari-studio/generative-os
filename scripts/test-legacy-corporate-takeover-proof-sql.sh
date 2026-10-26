#!/usr/bin/env bash
# Copyright IBM Corp. 2026
# This source code is licensed under the Apache-2.0 license found in the
# LICENSE file in the root directory of this source tree.
#
# Runs the LEGACY takeover-proof assertions (BEFORE evidence for
# BLK-provisioning-takeover, Directive §7.2) against a disposable Postgres
# (PG 17). Applies the rpc-grants prereq with alter_policies=true (the
# PERMISSIVE live policy surface the takeover was verified against) + the
# behavioral legacy stub, then the REAL takeover-safe provision RPC
# (20261026140000), then runs
# supabase/tests/legacy_corporate_tenant_takeover_proof.sql. Proves the
# authenticated-executable legacy RPC permits a full tenant takeover — the
# OPEN risk 20261026210000 closes. Local disposable-PG only; NO remote
# mutation.
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-legacy_corporate_takeover_test}"

SAFE_MIGRATION="supabase/migrations/20261026140000_provision_corporate_tenant_safe.sql"

echo ">> Recreating disposable database ${PGDATABASE} on ${PGHOST}:${PGPORT}"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" -c "CREATE DATABASE ${PGDATABASE};"

echo ">> Applying rpc-grants prerequisites (behavioral legacy stub + PERMISSIVE live policy surface)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -v alter_policies=true \
  -f supabase/tests/_prereq_rpc_grants.sql

echo ">> Applying the takeover-safe provision RPC (20261026140000)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 -f "${SAFE_MIGRATION}"

echo ">> Running LEGACY takeover-proof assertions (BEFORE evidence)"
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/legacy_corporate_tenant_takeover_proof.sql

echo ">> Applying 20261026210000 legacy-restrict (the AFTER state)"
psql -d "${PGDATABASE}" -q -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20261026210000_legacy_corporate_tenant_restrict.sql

echo ">> Re-running the IDENTICAL attack (AFTER evidence — must be denied)"
# The proof test's DO block asserts the takeover SUCCEEDED, so it cannot be
# re-run after 210000; the closed-loop assertions are the AFTER counterpart.
psql -d "${PGDATABASE}" -v ON_ERROR_STOP=1 -f supabase/tests/legacy_corporate_tenant_takeover_closed.sql

echo ">> LEGACY CORPORATE-TENANT TAKEOVER-PROOF SQL TESTS PASSED (BEFORE 7 + AFTER 6)"
