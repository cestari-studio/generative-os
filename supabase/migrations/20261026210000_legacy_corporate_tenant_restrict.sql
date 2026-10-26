-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the
-- root directory of this source tree.
--
-- 20261026210000_legacy_corporate_tenant_restrict.sql
--
-- Owner directive (2026-10-26, Stage-1 scope correction): revoking only
-- `anon`/`PUBLIC` from create_or_update_corporate_tenant does NOT close the
-- authenticated-takeover risk. The vulnerable conflict-update path (an
-- identifier conflict promotes the CALLER to org_owner of the victim org and
-- overwrites org data) is reachable by ANY authenticated user while the RPC
-- retains `authenticated` EXECUTE — that is the exact attack the successor
-- provision_corporate_tenant was built to prevent. Existence of the safe RPC
-- does not deactivate the vulnerable one.
--
-- CORRECTED SCOPE (acceptance criteria enforced by the companion test suite):
--   * PUBLIC, anon, authenticated : NO EXECUTE on create_or_update_corporate_tenant.
--   * service_role                : also REVOKED. Consumer inventory
--     (docs/create-or-update-corporate-tenant-consumers.md) found ZERO runtime
--     consumers of the legacy RPC — the browser wrapper
--     createOrUpdateCorporateTenant now calls provision_corporate_tenant, and no
--     Edge Function invokes it. There is no concrete justification to retain
--     service_role either; the full deprecation (drop) remains a SEPARATE owner
--     decision, so the function is left in place but invocable by NO role.
--   * provision_corporate_tenant  : unchanged here (authenticated-only by
--     20261026140000); re-asserted below so the authorized path stays intact.
--
-- This does NOT remove the function or rewrite history; it removes the
-- vulnerable surface from every common role.
--
-- ADDITIVE ONLY: grant changes only. DRAFT — validated on disposable
-- PostgreSQL 17.11; NOT applied remotely.

REVOKE EXECUTE ON FUNCTION public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) FROM service_role;

-- The authorized provisioning path is unaffected (authenticated-only; no anon /
-- no PUBLIC). Re-assert idempotently so this migration is self-contained.
GRANT EXECUTE ON FUNCTION public.provision_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.provision_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provision_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) FROM anon;
