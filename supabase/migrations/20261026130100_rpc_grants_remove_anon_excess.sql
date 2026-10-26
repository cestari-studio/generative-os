-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the
-- root directory of this source tree.
--
-- 20261026130100_rpc_grants_remove_anon_excess.sql
--
-- P1 (Worker D + reviewer): three SECURITY INVOKER RPCs are EXECUTE-exposed to
-- `anon` (and PUBLIC). Verified live + consumers inspected: all three are called
-- ONLY by the browser via TenantContext (authenticated user); there are NO anon
-- consumers in the repo. The anon exposure comes from Supabase pg_default_acl +
-- the PostgreSQL PUBLIC default, not from a deliberate contract.
--
--   save_onboarding_progress          -> TenantContext.jsx:420 (authenticated)
--   create_or_update_corporate_tenant -> TenantContext.jsx:483 (authenticated)
--   resolve_effective_settings        -> TenantContext.jsx:171 + settings-cascade fn (authenticated)
--
-- Fix: REVOKE EXECUTE from PUBLIC and anon for the exact signatures; keep
-- `authenticated` (the functional contract) + `service_role`. The body-level
-- auth.uid() checks stay as defense-in-depth, but authorization no longer relies
-- on them alone (per reviewer: existence != authorization).
--
-- ADDITIVE ONLY: grant changes only. No function body, table, policy or other
-- RPC altered. DRAFT — validated on disposable PostgreSQL 17.11; NOT applied remotely.

-- save_onboarding_progress(text, text, integer, jsonb, boolean)
REVOKE EXECUTE ON FUNCTION public.save_onboarding_progress(text, text, integer, jsonb, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_onboarding_progress(text, text, integer, jsonb, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_onboarding_progress(text, text, integer, jsonb, boolean) TO authenticated, service_role;

-- create_or_update_corporate_tenant(13 args)
REVOKE EXECUTE ON FUNCTION public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) TO authenticated, service_role;

-- resolve_effective_settings(uuid, uuid, uuid, uuid)
REVOKE EXECUTE ON FUNCTION public.resolve_effective_settings(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_effective_settings(uuid, uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_effective_settings(uuid, uuid, uuid, uuid) TO authenticated, service_role;
