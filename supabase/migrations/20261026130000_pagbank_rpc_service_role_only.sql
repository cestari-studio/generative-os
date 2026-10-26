-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the
-- root directory of this source tree.
--
-- 20261026130000_pagbank_rpc_service_role_only.sql
--
-- CRITICAL payment-flow hardening (Worker D finding, confirmed live 2026-10-26):
-- claim_pagbank_order and attach_psp_idempotency are SECURITY DEFINER and are
-- live-executable by `authenticated` with NO auth.uid()/membership check in
-- their bodies. Any authenticated session knowing victim UUIDs could win the
-- first-writer-wins race and permanently lock a tenant's payment flow (DoS).
--
-- Root cause: these two functions are ONLY legitimately called by the
-- `pagbank-order` Edge Function via `supabaseAdmin` (service_role), which already
-- performs the org-membership check (isOrgMemberViaDataApi) BEFORE invoking
-- them. The browser never calls them directly. Therefore the correct contract
-- is service_role-only EXECUTE — NOT a body-level auth check (that would be
-- redundant with the Edge Function's check and is not how the other service-
-- mediated RPCs work).
--
-- ADDITIVE ONLY: revokes EXECUTE from PUBLIC/anon/authenticated for the two exact
-- signatures, keeps service_role. No function body, table, policy or other RPC
-- altered. DRAFT — validated on disposable PostgreSQL 17.11; NOT applied remotely.

-- ---------------------------------------------------------------------------
-- claim_pagbank_order — Edge Function (service_role) is the sole consumer.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.claim_pagbank_order(uuid, uuid, uuid, uuid, text, uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_pagbank_order(uuid, uuid, uuid, uuid, text, uuid, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_pagbank_order(uuid, uuid, uuid, uuid, text, uuid, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pagbank_order(uuid, uuid, uuid, uuid, text, uuid, jsonb, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- attach_psp_idempotency — Edge Function (service_role) is the sole consumer.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.attach_psp_idempotency(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.attach_psp_idempotency(uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.attach_psp_idempotency(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.attach_psp_idempotency(uuid, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.claim_pagbank_order(uuid, uuid, uuid, uuid, text, uuid, jsonb, jsonb) IS
  'Claims a payment order atomically (first-writer-wins). service_role ONLY: the pagbank-order Edge Function is the sole consumer and performs the org-membership check before invoking. SECURITY DEFINER (justified: atomic claim requires owner privileges; DEFINER body has no auth check by design — authorization is the Edge Function boundary).';
COMMENT ON FUNCTION public.attach_psp_idempotency(uuid, uuid, text, text) IS
  'Attaches a PSP idempotency key to a claimed order, rejecting a retry with a different payload. service_role ONLY (see claim_pagbank_order).';
