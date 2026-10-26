-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- pagbank service_role-only grant assertions, run as authenticated / service_role.
-- Coverage (Master Directive §6.1) against 20261026130000:
--   * anon + authenticated are DENIED EXECUTE on claim_pagbank_order /
--     attach_psp_idempotency at the GRANT layer — proven by SQLSTATE 42501 with
--     the message 'permission denied for function <name>' (PostgreSQL's grant-layer
--     error), NOT a body-level rejection. These SECURITY DEFINER stubs carry NO
--     auth.uid() body check, so any 42501 here can only come from the grant.
--   * service_role (the legitimate pagbank-order Edge-Function path) is ALLOWED.
--   * Idempotency preserved: a second identical claim by service_role does NOT
--     double-apply (first-writer-wins on gateway_reference_id UNIQUE).
--   * No role can hijack another's claim / idempotency key.

\set QUIET on
\pset footer off

-- ---------------------------------------------------------------------------
-- Helper: assert that a denied call raised the GRANT-layer error. We capture
-- SQLSTATE + message and require BOTH 42501 AND 'permission denied for function'.
-- Because the stubs have no body auth check, 42501 here is unambiguous — but we
-- still assert the message so the test proves the grant (not any future body
-- check) is what blocks. Returns via RAISE EXCEPTION on mismatch.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_assert int := 0;
  v_result jsonb;
  v_order_id uuid;
  v_order_id_2 uuid;
  v_state text;
  v_msg text;
BEGIN
  RAISE NOTICE '=== pagbank service_role-only grant assertions (grant-layer proof) ===';

  -- -------------------------------------------------------------------------
  -- NEGATIVE: authenticated DENIED claim_pagbank_order (grant layer).
  -- -------------------------------------------------------------------------
  -- NOTE: p_quote_id is passed as NULL (not a quotes subquery) so the negative
  -- test isolates the FUNCTION-level grant. A `(SELECT id FROM quotes ...)` arg
  -- would be evaluated by the calling role BEFORE the function runs and, for a
  -- role without SELECT on quotes, would mask the function-grant denial behind
  -- a 'permission denied for table quotes' error. We want the function grant.
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  BEGIN
    PERFORM public.claim_pagbank_order('aaaaaaaa-0000-0000-0000-000000000001', NULL, NULL,
      NULL, 'ref-deny-auth-claim', NULL, '{}'::jsonb, '[]'::jsonb);
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated EXECUTE claim_pagbank_order succeeded (must be denied at grant layer)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_state = '42501' AND v_msg = 'permission denied for function claim_pagbank_order' THEN
      v_assert := v_assert + 1;
      RAISE NOTICE 'OK %: authenticated DENIED claim_pagbank_order — grant layer (SQLSTATE %, "%")', v_assert, v_state, v_msg;
    ELSE
      RAISE EXCEPTION 'ASSERTION FAILED: authenticated claim denial was NOT the grant layer (SQLSTATE %, msg "%") — expected 42501 permission denied for function', v_state, v_msg;
    END IF;
  END;

  -- -------------------------------------------------------------------------
  -- NEGATIVE: authenticated DENIED attach_psp_idempotency (grant layer).
  -- -------------------------------------------------------------------------
  BEGIN
    PERFORM public.attach_psp_idempotency(gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'key', 'fp');
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated EXECUTE attach_psp_idempotency succeeded (must be denied at grant layer)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_state = '42501' AND v_msg = 'permission denied for function attach_psp_idempotency' THEN
      v_assert := v_assert + 1;
      RAISE NOTICE 'OK %: authenticated DENIED attach_psp_idempotency — grant layer (SQLSTATE %, "%")', v_assert, v_state, v_msg;
    ELSE
      RAISE EXCEPTION 'ASSERTION FAILED: authenticated attach denial was NOT the grant layer (SQLSTATE %, msg "%")', v_state, v_msg;
    END IF;
  END;

  -- -------------------------------------------------------------------------
  -- NEGATIVE: anon DENIED claim_pagbank_order (grant layer).
  -- -------------------------------------------------------------------------
  SET ROLE anon;
  BEGIN
    PERFORM public.claim_pagbank_order('aaaaaaaa-0000-0000-0000-000000000001', NULL, NULL,
      NULL, 'ref-deny-anon-claim', NULL, '{}'::jsonb, '[]'::jsonb);
    RAISE EXCEPTION 'ASSERTION FAILED: anon EXECUTE claim_pagbank_order succeeded (must be denied at grant layer)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_state = '42501' AND v_msg = 'permission denied for function claim_pagbank_order' THEN
      v_assert := v_assert + 1;
      RAISE NOTICE 'OK %: anon DENIED claim_pagbank_order — grant layer (SQLSTATE %, "%")', v_assert, v_state, v_msg;
    ELSE
      RAISE EXCEPTION 'ASSERTION FAILED: anon claim denial was NOT the grant layer (SQLSTATE %, msg "%")', v_state, v_msg;
    END IF;
  END;

  -- -------------------------------------------------------------------------
  -- NEGATIVE: anon DENIED attach_psp_idempotency (grant layer).
  -- -------------------------------------------------------------------------
  BEGIN
    PERFORM public.attach_psp_idempotency(gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'key', 'fp');
    RAISE EXCEPTION 'ASSERTION FAILED: anon EXECUTE attach_psp_idempotency succeeded (must be denied at grant layer)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_state = '42501' AND v_msg = 'permission denied for function attach_psp_idempotency' THEN
      v_assert := v_assert + 1;
      RAISE NOTICE 'OK %: anon DENIED attach_psp_idempotency — grant layer (SQLSTATE %, "%")', v_assert, v_state, v_msg;
    ELSE
      RAISE EXCEPTION 'ASSERTION FAILED: anon attach denial was NOT the grant layer (SQLSTATE %, msg "%")', v_state, v_msg;
    END IF;
  END;

  -- -------------------------------------------------------------------------
  -- POSITIVE: service_role CAN execute claim_pagbank_order (Edge Function path).
  -- -------------------------------------------------------------------------
  SET ROLE service_role;
  SELECT public.claim_pagbank_order('aaaaaaaa-0000-0000-0000-000000000001', NULL, NULL,
    (SELECT id FROM public.quotes LIMIT 1), 'ref-svc-1', NULL, '{}'::jsonb, '[]'::jsonb) INTO v_result;
  IF (v_result->>'claimed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: service_role claim did not succeed: %', v_result;
  END IF;
  v_order_id := (v_result->>'order_id')::uuid;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: service_role EXECUTE claim_pagbank_order succeeds (Edge Function path), order_id=%', v_assert, v_order_id;

  -- -------------------------------------------------------------------------
  -- POSITIVE: service_role CAN execute attach_psp_idempotency.
  -- -------------------------------------------------------------------------
  SELECT public.attach_psp_idempotency(v_order_id, 'aaaaaaaa-0000-0000-0000-000000000001', 'psp-key-1', 'fp-1') INTO v_result;
  IF (v_result->>'attached')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: service_role attach did not succeed: %', v_result;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: service_role EXECUTE attach_psp_idempotency succeeds', v_assert;

  -- -------------------------------------------------------------------------
  -- IDEMPOTENCY / REPLAY: a SECOND identical claim by service_role (same
  -- gateway_reference_id) must NOT double-apply. first-writer-wins on the
  -- UNIQUE gateway_reference_id: the replay is rejected (unique_violation) and
  -- the original order_id is unchanged. We assert exactly ONE row exists for
  -- the reference, i.e. no duplicate order was created.
  -- -------------------------------------------------------------------------
  BEGIN
    SELECT public.claim_pagbank_order('aaaaaaaa-0000-0000-0000-000000000001', NULL, NULL,
      (SELECT id FROM public.quotes LIMIT 1), 'ref-svc-1', NULL, '{}'::jsonb, '[]'::jsonb) INTO v_result;
    -- If the stub returned a NEW order_id for the same reference, idempotency broke.
    v_order_id_2 := (v_result->>'order_id')::uuid;
    IF v_order_id_2 IS DISTINCT FROM v_order_id THEN
      RAISE EXCEPTION 'ASSERTION FAILED: replayed claim created a SECOND order (% vs %) — idempotency broken', v_order_id, v_order_id_2;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    -- Expected path: the UNIQUE gateway_reference_id rejects the duplicate claim.
    NULL;
  END;
  -- Assert exactly one order row for the reference (no double-apply).
  IF (SELECT count(*) FROM public.payment_orders WHERE gateway_reference_id = 'ref-svc-1') <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: expected exactly 1 payment_order for ref-svc-1, found % — replay double-applied',
      (SELECT count(*) FROM public.payment_orders WHERE gateway_reference_id = 'ref-svc-1');
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: service_role replay of identical claim does NOT double-apply (idempotency preserved, 1 order for ref-svc-1)', v_assert;

  -- -------------------------------------------------------------------------
  -- ANTI-HIJACK: a non-service_role caller can NEITHER re-claim an existing
  -- reference NOR attach a foreign idempotency key to another's order. The
  -- grant layer already blocks anon/authenticated from invoking either function
  -- at all, so a hijack attempt is denied before any state can be touched.
  -- -------------------------------------------------------------------------
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  BEGIN
    -- Hijack attempt: overwrite the idempotency key on service_role's order.
    PERFORM public.attach_psp_idempotency(v_order_id, 'aaaaaaaa-0000-0000-0000-000000000001', 'HIJACKED-KEY', 'HIJACKED-FP');
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated hijack of idempotency key succeeded (must be denied)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_state = '42501' AND v_msg = 'permission denied for function attach_psp_idempotency' THEN
      v_assert := v_assert + 1;
      RAISE NOTICE 'OK %: authenticated CANNOT hijack another''s idempotency key (grant layer blocks attach)', v_assert;
    ELSE
      RAISE EXCEPTION 'ASSERTION FAILED: hijack denial was NOT the grant layer (SQLSTATE %, msg "%")', v_state, v_msg;
    END IF;
  END;

  -- Confirm the idempotency key was NOT hijacked (still the original value).
  SET ROLE service_role;
  IF (SELECT psp_idempotency_key FROM public.payment_orders WHERE id = v_order_id) IS DISTINCT FROM 'psp-key-1' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: idempotency key was modified by a foreign role (now "%") — hijack succeeded',
      (SELECT psp_idempotency_key FROM public.payment_orders WHERE id = v_order_id);
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: idempotency key on service_role order unchanged after hijack attempt (still psp-key-1)', v_assert;

  RESET ROLE;
  RAISE NOTICE '=== ALL % ASSERTIONS PASSED ===', v_assert;
END $$;
