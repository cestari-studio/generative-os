-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- pagbank service_role-only grant assertions, run as authenticated / service_role.
-- Coverage: authenticated + anon can NO LONGER execute claim_pagbank_order /
-- attach_psp_idempotency after the grant migration; service_role still can.

\set QUIET on
\pset footer off

DO $$
DECLARE
  v_assert int := 0;
  v_result jsonb;
  v_order_id uuid;
BEGIN
  RAISE NOTICE '=== pagbank service_role-only grant assertions ===';

  -- 1. authenticated can NO LONGER execute claim_pagbank_order.
  SET ROLE authenticated;
  SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  BEGIN
    PERFORM public.claim_pagbank_order('aaaaaaaa-0000-0000-0000-000000000001', NULL, NULL,
      (SELECT id FROM public.quotes LIMIT 1), 'ref-1', NULL, '{}'::jsonb, '[]'::jsonb);
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated EXECUTE claim_pagbank_order succeeded (must be denied)';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: authenticated EXECUTE claim_pagbank_order denied', v_assert;
  END;

  -- 2. authenticated can NO LONGER execute attach_psp_idempotency.
  BEGIN
    PERFORM public.attach_psp_idempotency(gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'key', 'fp');
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated EXECUTE attach_psp_idempotency succeeded (must be denied)';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: authenticated EXECUTE attach_psp_idempotency denied', v_assert;
  END;

  -- 3. anon can NO LONGER execute claim_pagbank_order.
  SET ROLE anon;
  BEGIN
    PERFORM public.claim_pagbank_order('aaaaaaaa-0000-0000-0000-000000000001', NULL, NULL,
      (SELECT id FROM public.quotes LIMIT 1), 'ref-2', NULL, '{}'::jsonb, '[]'::jsonb);
    RAISE EXCEPTION 'ASSERTION FAILED: anon EXECUTE claim_pagbank_order succeeded (must be denied)';
  EXCEPTION WHEN insufficient_privilege THEN
    v_assert := v_assert + 1;
    RAISE NOTICE 'OK %: anon EXECUTE claim_pagbank_order denied', v_assert;
  END;

  -- 4. service_role CAN execute claim_pagbank_order (the Edge Function path).
  SET ROLE service_role;
  SELECT public.claim_pagbank_order('aaaaaaaa-0000-0000-0000-000000000001', NULL, NULL,
    (SELECT id FROM public.quotes LIMIT 1), 'ref-svc-1', NULL, '{}'::jsonb, '[]'::jsonb) INTO v_result;
  IF (v_result->>'claimed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: service_role claim did not succeed: %', v_result;
  END IF;
  v_order_id := (v_result->>'order_id')::uuid;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: service_role EXECUTE claim_pagbank_order succeeds (Edge Function path)', v_assert;

  -- 5. service_role CAN execute attach_psp_idempotency.
  SELECT public.attach_psp_idempotency(v_order_id, 'aaaaaaaa-0000-0000-0000-000000000001', 'psp-key-1', 'fp-1') INTO v_result;
  IF (v_result->>'attached')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: service_role attach did not succeed: %', v_result;
  END IF;
  v_assert := v_assert + 1;
  RAISE NOTICE 'OK %: service_role EXECUTE attach_psp_idempotency succeeds', v_assert;

  RESET ROLE;
  RAISE NOTICE '=== ALL % ASSERTIONS PASSED ===', v_assert;
END $$;
