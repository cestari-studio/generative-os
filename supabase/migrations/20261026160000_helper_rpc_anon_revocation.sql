-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the
-- root directory of this source tree.
--
-- 20261026160000_helper_rpc_anon_revocation.sql
--
-- CI grant-exposure guard (scripts/check-rpc-grant-exposure.mjs) + live-DB
-- verification (2026-10-26): 8 public functions are EXECUTE-exposed to anon
-- (has_function_privilege('anon', ..., 'EXECUTE') = true) via pg_default_acl +
-- the PG PUBLIC default. None has an explicit PUBLIC/anon revocation anywhere.
-- A 9th (match_knowledge_chunks) is INTENTIONALLY public read search and is
-- allowlisted in specs/rpc-grant-allowlist.json (NOT revoked here).
--
-- ADDITIVE ONLY: revokes PUBLIC + anon EXECUTE for the 8 non-allowlisted
-- functions (exact signatures, live-verified), keeps authenticated (browser
-- contract) + service_role. No function body, table, policy or other RPC
-- altered. DRAFT — validated on disposable PostgreSQL 17.11; NOT applied remotely.

-- Internal helper/trigger functions (INVOKER; not meant to be called directly).
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.enforce_scoped_setting_lock() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_scoped_setting_lock() FROM anon;
GRANT EXECUTE ON FUNCTION public.enforce_scoped_setting_lock() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.jsonb_cascade_merge(jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.jsonb_cascade_merge(jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.jsonb_cascade_merge(jsonb, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.to_schema_org_jsonld(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.to_schema_org_jsonld(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.to_schema_org_jsonld(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.enforce_surface_template_allowlist() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_surface_template_allowlist() FROM anon;
GRANT EXECUTE ON FUNCTION public.enforce_surface_template_allowlist() TO authenticated, service_role;

-- Mutating public-API functions (browser TenantContext is the consumer; must be
-- authenticated-only, NOT anon).
REVOKE EXECUTE ON FUNCTION public.switch_active_context(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.switch_active_context(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.switch_active_context(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_workspace(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_workspace(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_workspace(uuid, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated, service_role;
