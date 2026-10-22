-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Billing RLS + pricing assertions, executed as the `authenticated` role with
-- RLS enforced (never as owner/superuser). Any failed expectation raises and
-- aborts the run (psql ON_ERROR_STOP).

CREATE OR REPLACE FUNCTION pg_temp.expect(p_actual text, p_expected text, p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL: % — expected %, got %', p_label, p_expected, p_actual;
  END IF;
  RAISE NOTICE 'PASS: %', p_label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_label text, p_fragment text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_msg text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'FAIL: % — expected an error, statement succeeded', p_label;
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    IF v_msg LIKE 'FAIL: %' THEN
      RAISE;
    END IF;
    IF p_fragment IS NOT NULL AND position(lower(p_fragment) in lower(v_msg)) = 0 THEN
      RAISE EXCEPTION 'FAIL: % — error % does not contain %', p_label, v_msg, p_fragment;
    END IF;
    RAISE NOTICE 'PASS: % (%)', p_label, v_msg;
  END;
END $$;

-- ==========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

DO $$
DECLARE
  v_book uuid := (SELECT id FROM public.price_books WHERE identifier = 'brl-2026-10');
  v_per_unit uuid := (SELECT pc.id FROM public.price_components pc WHERE pc.price_book_id = v_book AND pc.pricing_model = 'per_unit');
  v_tiered uuid := (SELECT pc.id FROM public.price_components pc WHERE pc.price_book_id = v_book AND pc.pricing_model = 'tiered');
  v_org_a uuid := '11111111-1111-1111-1111-111111111111';
  v_total text;
  v_quote uuid;
  v_replay jsonb;
BEGIN
  RAISE NOTICE '=== direct-write denial ===';
  PERFORM pg_temp.expect_error(
    format('INSERT INTO public.quotes(organization_id, idempotency_key, currency, expires_at) VALUES (%L, %L, %L, now())', v_org_a, 'hack-1', 'BRL'),
    'direct INSERT into quotes is denied');
  PERFORM pg_temp.expect_error(
    format('INSERT INTO public.usage_events(event_id, organization_id, meter_code, quantity) VALUES (%L, %L, %L, 999)', 'hack-1', v_org_a, 'documents.indexed'),
    'direct INSERT into usage_events is denied');
  PERFORM pg_temp.expect_error(
    'INSERT INTO public.billing_audit(entity_type, entity_id, action) VALUES (''quote'', gen_random_uuid(), ''create'')',
    'direct INSERT into billing_audit is denied');

  RAISE NOTICE '=== per_unit pricing ===';
  v_total := (public.issue_quote(v_org_a, v_book, jsonb_build_array(jsonb_build_object('price_component_id', v_per_unit, 'quantity', 4)), 't-per-unit')) ->> 'total_cents';
  PERFORM pg_temp.expect(v_total, '1000', 'per_unit 4 x 250 = 1000');

  RAISE NOTICE '=== quote idempotent replay ===';
  v_replay := public.issue_quote(v_org_a, v_book, jsonb_build_array(jsonb_build_object('price_component_id', v_per_unit, 'quantity', 4)), 't-per-unit');
  PERFORM pg_temp.expect(v_replay ->> 'idempotent_replay', 'true', 'issue_quote idempotent replay');

  RAISE NOTICE '=== tiered boundaries ===';
  PERFORM pg_temp.expect(
    (public.issue_quote(v_org_a, v_book, jsonb_build_array(jsonb_build_object('price_component_id', v_tiered, 'quantity', 5)), 't-t5')) ->> 'total_cents',
    '1250', 'tiered q5 = 5x250');
  PERFORM pg_temp.expect(
    (public.issue_quote(v_org_a, v_book, jsonb_build_array(jsonb_build_object('price_component_id', v_tiered, 'quantity', 10)), 't-t10')) ->> 'total_cents',
    '2500', 'tiered q10 = 10x250');
  PERFORM pg_temp.expect(
    (public.issue_quote(v_org_a, v_book, jsonb_build_array(jsonb_build_object('price_component_id', v_tiered, 'quantity', 11)), 't-t11')) ->> 'total_cents',
    '2700', 'tiered q11 = 10x250 + 1x200');
  PERFORM pg_temp.expect(
    (public.issue_quote(v_org_a, v_book, jsonb_build_array(jsonb_build_object('price_component_id', v_tiered, 'quantity', 50)), 't-t50')) ->> 'total_cents',
    '10500', 'tiered q50 = 10x250 + 40x200');
  PERFORM pg_temp.expect(
    (public.issue_quote(v_org_a, v_book, jsonb_build_array(jsonb_build_object('price_component_id', v_tiered, 'quantity', 51)), 't-t51')) ->> 'total_cents',
    '10650', 'tiered q51 = 10x250 + 40x200 + 1x150');
  PERFORM pg_temp.expect(
    (public.issue_quote(v_org_a, v_book, jsonb_build_array(jsonb_build_object('price_component_id', v_tiered, 'quantity', 100)), 't-t100')) ->> 'total_cents',
    '18000', 'tiered q100 = 10x250 + 40x200 + 50x150');

  RAISE NOTICE '=== usage event idempotency ===';
  PERFORM public.record_usage_event('t-evt-1', v_org_a, 'documents.indexed', 10);
  PERFORM pg_temp.expect(
    (public.record_usage_event('t-evt-1', v_org_a, 'documents.indexed', 10)) ->> 'idempotent_replay',
    'true', 'record_usage_event idempotent replay');
END $$;

-- ==========================================================================
-- Cross-tenant: member of Org B cannot act on Org A
SET request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE
  v_book uuid := (SELECT id FROM public.price_books WHERE identifier = 'brl-2026-10');
  v_per_unit uuid := (SELECT pc.id FROM public.price_components pc WHERE pc.price_book_id = v_book AND pc.pricing_model = 'per_unit');
  v_org_a uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  RAISE NOTICE '=== cross-tenant ===';
  PERFORM pg_temp.expect_error(
    format('SELECT public.issue_quote(%L, %L, jsonb_build_array(jsonb_build_object(''price_component_id'', %L, ''quantity'', 1)), ''t-x'')', v_org_a, v_book, v_per_unit),
    'cross-tenant issue_quote denied', 'Access denied');
  PERFORM pg_temp.expect(
    (SELECT count(*)::text FROM public.quotes),
    '0', 'cross-tenant read sees zero quotes');
  PERFORM pg_temp.expect(
    (SELECT count(*)::text FROM public.platform_role_assignments),
    '0', 'member sees only own role assignments (zero here)');
  PERFORM pg_temp.expect(
    public.has_platform_role('billing_admin')::text,
    'false', 'has_platform_role without recursion (non-admin)');

  RAISE NOTICE '=== A-vs-B: caller cannot probe another person roles ===';
  -- The public API is caller-only (auth.uid()); there is no way to pass B's id.
  PERFORM pg_temp.expect_error(
    'SELECT public.has_platform_role(''billing_admin'', ''dddddddd-dddd-dddd-dddd-dddddddddddd''::uuid)',
    'public two-argument signature is removed (A probing B fails)', 'does not exist');
  -- The internal helper is not executable by API roles either.
  PERFORM pg_temp.expect_error(
    'SELECT app_private.has_platform_role(''billing_admin'', ''dddddddd-dddd-dddd-dddd-dddddddddddd''::uuid)',
    'internal helper not executable by authenticated', 'permission denied');
  -- A still resolves only A's own roles via the public caller-only API.
  PERFORM pg_temp.expect(
    public.has_platform_role('platform_admin')::text,
    'false', 'caller-only API resolves only the caller (A is not platform_admin)');
END $$;

-- Catalog proof: the vulnerable public two-argument signature is gone.
DO $$
BEGIN
  PERFORM pg_temp.expect(
    (SELECT count(*)::text FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'has_platform_role' AND p.pronargs = 2),
    '0', 'no public has_platform_role/2 signature remains');
  PERFORM pg_temp.expect(
    (SELECT count(*)::text FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'has_platform_role' AND p.pronargs = 1),
    '1', 'exactly one public caller-only has_platform_role/1 exists');
END $$;

-- ==========================================================================
-- Quote consumption lifecycle: manual quote, consume, single-use, release
RESET ROLE;
DO $$
DECLARE
  v_quote uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

  v_quote := (public.issue_manual_quote('11111111-1111-1111-1111-111111111111', 4200, 'BRL', 'lifecycle test', 't-mq-1')) ->> 'quote_id';

  PERFORM pg_temp.expect(
    (public.consume_quote(v_quote, '11111111-1111-1111-1111-111111111111', 'ORD-1')) ->> 'total_cents',
    '4200', 'consume_quote returns server total');
  PERFORM pg_temp.expect(
    (public.consume_quote(v_quote, '11111111-1111-1111-1111-111111111111', 'ORD-1')) ->> 'idempotent_replay',
    'true', 'consume_quote idempotent replay for same reference');
  PERFORM pg_temp.expect_error(
    format('SELECT public.consume_quote(%L, %L, %L)', v_quote, '11111111-1111-1111-1111-111111111111', 'ORD-OTHER'),
    'consume with a different reference after acceptance fails', 'not consumable');

  -- Release path: allowed while no active order references the quote.
  PERFORM pg_temp.expect(
    (public.release_consumed_quote(v_quote, 'psp timeout')) ->> 'status',
    'cancelled', 'release_consumed_quote cancels a consumed quote with no active order');
  PERFORM pg_temp.expect_error(
    format('SELECT public.consume_quote(%L, %L, %L)', v_quote, '11111111-1111-1111-1111-111111111111', 'ORD-NEW'),
    'consuming a cancelled quote fails', 'not consumable');

  -- Release path blocked by an active order (order setup runs as postgres,
  -- simulating the trusted backend; assertions run as authenticated).
  v_quote := (public.issue_manual_quote('11111111-1111-1111-1111-111111111111', 9900, 'BRL', 'blocked release', 't-mq-2')) ->> 'quote_id';
  PERFORM public.consume_quote(v_quote, '11111111-1111-1111-1111-111111111111', 'ORD-2');
END $$;

DO $$
BEGIN
  INSERT INTO public.payment_orders(organization_id, gateway_reference_id, amount_cents, status, quote_id)
    SELECT '11111111-1111-1111-1111-111111111111', 'ORD-2', 9900, 'waiting_payment', q.id
    FROM public.quotes q WHERE q.idempotency_key = 't-mq-2';
END $$;

DO $$
DECLARE
  v_quote uuid := (SELECT id FROM public.quotes WHERE idempotency_key = 't-mq-2');
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  PERFORM pg_temp.expect_error(
    format('SELECT public.release_consumed_quote(%L, %L)', v_quote, 'operator retry'),
    'release blocked while an active order exists', 'active payment order');
END $$;

DO $$
BEGIN
  UPDATE public.payment_orders SET status = 'canceled' WHERE gateway_reference_id = 'ORD-2';
END $$;

DO $$
DECLARE
  v_quote uuid := (SELECT id FROM public.quotes WHERE idempotency_key = 't-mq-2');
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  PERFORM pg_temp.expect(
    (public.release_consumed_quote(v_quote, 'order canceled at PSP')) ->> 'status',
    'cancelled', 'release allowed once every linked order is canceled');
END $$;

-- ==========================================================================
-- Atomic claim protocol (claim_pagbank_order) — concurrency, replay, guards.
-- Quotes are issued/consumed as the authenticated member; claims run as
-- service_role (the trusted backend role used by pagbank-order).
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  PERFORM public.issue_manual_quote('11111111-1111-1111-1111-111111111111', 5000, 'BRL', 'claim test', 't-claim-1');
  PERFORM public.issue_manual_quote('11111111-1111-1111-1111-111111111111', 6000, 'BRL', 'unconsumed claim', 't-claim-2');
END $$;

DO $$
DECLARE
  v_quote uuid := (SELECT id FROM public.quotes WHERE idempotency_key = 't-claim-1');
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  PERFORM public.consume_quote(v_quote, '11111111-1111-1111-1111-111111111111', 'ORD-CLAIM-1');
END $$;

DO $$
DECLARE
  v_org_a uuid := '11111111-1111-1111-1111-111111111111';
  v_person_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_quote uuid := (SELECT id FROM public.quotes WHERE idempotency_key = 't-claim-1');
  v_quote2 uuid := (SELECT id FROM public.quotes WHERE idempotency_key = 't-claim-2');
  v_claim1 jsonb;
  v_claim2 jsonb;
  v_order1 uuid;
BEGIN
  SET LOCAL ROLE service_role;
  RAISE NOTICE '=== atomic claim: concurrency, replay, guards ===';

  -- A consumed quote can be claimed once; the second claim replays it.
  v_claim1 := public.claim_pagbank_order(v_org_a, NULL, NULL, v_quote, 'ORD-CLAIM-1', v_person_a, '{"name":"Customer A"}'::jsonb);
  PERFORM pg_temp.expect(v_claim1 ->> 'claimed', 'true', 'first claim wins (claimed=true)');
  PERFORM pg_temp.expect(v_claim1 ->> 'amount_cents', '5000', 'claim derives amount from the consumed quote');

  v_claim2 := public.claim_pagbank_order(v_org_a, NULL, NULL, v_quote, 'ORD-CLAIM-1', v_person_a, '{"name":"Customer A"}'::jsonb);
  PERFORM pg_temp.expect(v_claim2 ->> 'claimed', 'false', 'second claim for same quote replays (claimed=false)');
  PERFORM pg_temp.expect(v_claim2 ->> 'order_id', v_claim1 ->> 'order_id', 'replay returns the same order (no duplicate)');
  v_order1 := (v_claim1 ->> 'order_id')::uuid;
  PERFORM pg_temp.expect(
    (SELECT count(*)::text FROM public.payment_orders WHERE quote_id = v_quote),
    '1', 'exactly one order per quote (no concurrent duplicates)');

  -- A replay with a DIFFERENT reference on the same quote is rejected.
  PERFORM pg_temp.expect_error(
    format('SELECT public.claim_pagbank_order(%L, NULL, NULL, %L, %L, %L, ''{}''::jsonb)', v_org_a, v_quote, 'ORD-CLAIM-DIFFERENT', v_person_a),
    'claim with a different reference on a claimed quote fails', 'another payment reference');

  -- An unconsumed (issued) quote cannot be claimed. (t-claim-2 was created
  -- as authenticated in the setup block; never consumed.)
  PERFORM pg_temp.expect_error(
    format('SELECT public.claim_pagbank_order(%L, NULL, NULL, %L, %L, %L, ''{}''::jsonb)', v_org_a, v_quote2, 'ORD-CLAIM-2', v_person_a),
    'claiming an unconsumed quote fails', 'must be consumed');

  -- Cross-tenant: claiming org B's quote from org A's org id fails.
  PERFORM pg_temp.expect_error(
    format('SELECT public.claim_pagbank_order(%L, NULL, NULL, %L, %L, %L, ''{}''::jsonb)', '22222222-2222-2222-2222-222222222222', v_quote, 'ORD-X', v_person_a),
    'claim with mismatched tenant fails', 'does not belong');

  RAISE NOTICE '=== PSP idempotency attach: same key+payload replays, mismatch rejected ===';
  PERFORM pg_temp.expect(
    (public.attach_psp_idempotency(v_order1, v_org_a, 'ORDCLAIM1', 'fp-aaa')) ->> 'attached',
    'true', 'first PSP idempotency key attached');
  PERFORM pg_temp.expect(
    (public.attach_psp_idempotency(v_order1, v_org_a, 'ORDCLAIM1', 'fp-aaa')) ->> 'idempotent_replay',
    'true', 'same key + same fingerprint replays');
  PERFORM pg_temp.expect_error(
    format('SELECT public.attach_psp_idempotency(%L, %L, %L, %L)', v_order1, v_org_a, 'ORDCLAIM1', 'fp-DIFFERENT'),
    'same key with a different payload fingerprint is rejected', 'different PSP idempotency key/payload');
  PERFORM pg_temp.expect_error(
    format('SELECT public.attach_psp_idempotency(%L, %L, %L, %L)', v_order1, v_org_a, 'OTHERKEY', 'fp-aaa'),
    'a different key for the same order is rejected', 'different PSP idempotency key/payload');
END $$;

-- Catalog proof: the unique partial index enforcing one-charge-per-quote.
DO $$
BEGIN
  PERFORM pg_temp.expect(
    (SELECT count(*)::text FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'payment_orders'
        AND indexname = 'payment_orders_quote_id_key' AND indexdef LIKE '%UNIQUE%'),
    '1', 'unique partial index payment_orders_quote_id_key exists');
END $$;

-- Release semantics with the authoritative status vocabulary:
-- 'draft' (in-flight) blocks; 'canceled' (terminal non-paid) allows.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  PERFORM public.issue_manual_quote('11111111-1111-1111-1111-111111111111', 7700, 'BRL', 'release vocab', 't-mq-4');
  PERFORM public.consume_quote(
    (SELECT id FROM public.quotes WHERE idempotency_key = 't-mq-4'),
    '11111111-1111-1111-1111-111111111111', 'ORD-4');
END $$;

DO $$
DECLARE
  v_quote uuid := (SELECT id FROM public.quotes WHERE idempotency_key = 't-mq-4');
BEGIN
  SET LOCAL ROLE service_role;
  PERFORM public.claim_pagbank_order('11111111-1111-1111-1111-111111111111', NULL, NULL, v_quote, 'ORD-4', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{}'::jsonb);
END $$;

DO $$
DECLARE
  v_quote uuid := (SELECT id FROM public.quotes WHERE idempotency_key = 't-mq-4');
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  PERFORM pg_temp.expect_error(
    format('SELECT public.release_consumed_quote(%L, %L)', v_quote, 'timeout'),
    'release blocked while order is draft (in-flight, unknown PSP state)', 'active payment order');
END $$;

DO $$
BEGIN
  UPDATE public.payment_orders po SET status = 'canceled'
    FROM public.quotes q
    WHERE po.quote_id = q.id AND q.idempotency_key = 't-mq-4';
END $$;

DO $$
DECLARE
  v_quote uuid := (SELECT id FROM public.quotes WHERE idempotency_key = 't-mq-4');
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  PERFORM pg_temp.expect(
    (public.release_consumed_quote(v_quote, 'definitive rejection')) ->> 'status',
    'cancelled', 'release allowed once the linked order is canceled');
END $$;

-- ==========================================================================
-- Expiry: an expired quote cannot be consumed.
RESET ROLE;
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  PERFORM (public.issue_manual_quote('11111111-1111-1111-1111-111111111111', 100, 'BRL', 'expiry test', 't-mq-3', interval '1 second'));
END $$;

-- Backdate the quote as postgres (test setup, not a client operation).
DO $$
BEGIN
  UPDATE public.quotes SET expires_at = now() - interval '1 second' WHERE idempotency_key = 't-mq-3';
END $$;

DO $$
DECLARE
  v_quote uuid := (SELECT id FROM public.quotes WHERE idempotency_key = 't-mq-3');
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  PERFORM pg_temp.expect_error(
    format('SELECT public.consume_quote(%L, %L, %L)', v_quote, '11111111-1111-1111-1111-111111111111', 'ORD-EXP'),
    'expired quote cannot be consumed', 'expired');
END $$;

RESET ROLE;
SELECT 'ALL BILLING SQL TESTS PASSED' AS result;
