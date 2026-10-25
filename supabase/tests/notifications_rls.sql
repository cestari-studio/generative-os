-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.

-- Notifications persistence contract tests (slice 6.2), executed as the
-- `authenticated` role with RLS enforced (never as owner/superuser).
--
-- Contract (minimal honest foundation, per normative
-- capability.integration_notification entities NotificationIntent /
-- DeliveryAttempt — the dispatch/channel machinery is out of scope until
-- provider integrations exist):
--   public.notifications: org-scoped notification records with read state.
--   Members read their org's notifications; cross-tenant reads see nothing;
--   members mark their org's notifications read; no cross-tenant writes.

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

\echo '=== notifications: seeded org-A notification is visible to org-A member ==='
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT pg_temp.expect(
  (SELECT count(*)::text FROM public.notifications WHERE organization_id = 'aaaaaaaa-0000-4000-8000-0000000000a1'),
  '1',
  'org-A member sees the org-A notification'
);

RESET ROLE;

\echo '=== notifications: cross-tenant read is invisible (org-B member sees zero of org A) ==='
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

SELECT pg_temp.expect(
  (SELECT count(*)::text FROM public.notifications WHERE organization_id = 'aaaaaaaa-0000-4000-8000-0000000000a1'),
  '0',
  'org-B member sees no org-A notifications (RLS)'
);

RESET ROLE;

\echo '=== notifications: org-A member marks the notification read ==='
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT public.mark_notification_read(
  (SELECT id FROM public.notifications WHERE organization_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' LIMIT 1)
) AS marked;

SELECT pg_temp.expect(
  (SELECT (read_at IS NOT NULL)::text FROM public.notifications WHERE organization_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' LIMIT 1),
  'true',
  'org-A member marked the notification read'
);

RESET ROLE;

\echo '=== notifications: cross-tenant mark-read is denied ==='
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

SELECT pg_temp.expect_error(
  $$SELECT public.mark_notification_read((SELECT id FROM public.notifications WHERE organization_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' LIMIT 1))$$,
  'cross-tenant mark-read denied',
  NULL
);

RESET ROLE;

\echo '=== notifications: client cannot insert a notification directly (server-only writes) ==='
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT pg_temp.expect_error(
  $$INSERT INTO public.notifications (organization_id, kind, title) VALUES ('aaaaaaaa-0000-4000-8000-0000000000a1', 'system', 'hack')$$,
  'client direct insert denied',
  NULL
);

RESET ROLE;

\echo '=== notifications: ALL TESTS PASSED ==='
