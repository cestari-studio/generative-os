-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.

-- Workspace management contract tests (slice 6.1), executed as the
-- `authenticated` role with RLS enforced (never as owner/superuser). Any
-- failed expectation raises and aborts the run (psql ON_ERROR_STOP).
--
-- Contract: public.create_workspace(organization_id, identifier, name,
-- description?) — creates a workspace inside an existing organization only
-- when the caller is an org admin/owner. Non-members and plain members are
-- denied. identifier is unique per organization.

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

\echo '=== workspace management: org admin creates a workspace ==='
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT public.create_workspace(
  'aaaaaaaa-0000-4000-8000-0000000000a1',
  'alpha-ops',
  'Alpha Operations',
  'Operations workspace'
) AS created;

SELECT pg_temp.expect(
  (SELECT count(*)::text FROM public.workspaces WHERE organization_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' AND identifier = 'alpha-ops'),
  '1',
  'org admin created the workspace'
);

RESET ROLE;

\echo '=== workspace management: cross-tenant denial (member of org B cannot create in org A) ==='
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

SELECT pg_temp.expect_error(
  $$SELECT public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'alpha-hack', 'Hack', NULL)$$,
  'cross-tenant create denied',
  'privilege'
);

RESET ROLE;

\echo '=== workspace management: plain org member (non-admin) cannot create ==='
SELECT pg_temp.expect_error(
  $$SELECT public.create_workspace('bbbbbbbb-0000-4000-8000-0000000000b1', 'beta-hack', 'Hack', NULL)$$,
  'non-admin create denied',
  'privilege'
);

RESET ROLE;

\echo '=== workspace management: unknown/anonymous caller cannot create ==='
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

SELECT pg_temp.expect_error(
  $$SELECT public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'anon-hack', 'Hack', NULL)$$,
  'anonymous create denied',
  'privilege'
);

RESET ROLE;

\echo '=== workspace management: duplicate identifier per org is rejected ==='
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT pg_temp.expect_error(
  $$SELECT public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'alpha-ops', 'Duplicate', NULL)$$,
  'duplicate identifier rejected',
  NULL
);

RESET ROLE;

\echo '=== workspace management: ALL TESTS PASSED ==='
