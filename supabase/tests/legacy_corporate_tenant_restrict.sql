-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Assertions for 20261026210000_legacy_corporate_tenant_restrict.sql — the
-- Stage-1 scope correction the owner required. Proves the authenticated-takeover
-- surface on the legacy create_or_update_corporate_tenant is closed for EVERY
-- common role, while the authorized provision_corporate_tenant path stays open.
-- Runs on disposable PostgreSQL 17.11.
--
-- Acceptance criteria (owner directive):
--   C1  PUBLIC / anon / authenticated have NO EXECUTE on the legacy RPC.
--   C2  service_role has NO EXECUTE on the legacy RPC (no justified consumer).
--   C3  provision_corporate_tenant stays executable by authenticated (the
--       authorized path), NOT by anon/PUBLIC.
--   C4  an authenticated caller CANNOT invoke the legacy RPC (takeover vector
--       closed at the grant layer, before any function body runs).
--   C5  provision_corporate_tenant still runs for an authenticated caller.

\echo '=== LEGACY CORPORATE-TENANT RESTRICT ASSERTIONS ==='

-- C1/C2/C3 — catalog-level grant assertions (role-independent).
DO $$
DECLARE
  v_legacy regprocedure := 'public.create_or_update_corporate_tenant(text,text,text,text,text,text,text,text,text,jsonb,text,text,text)'::regprocedure;
  v_new regprocedure := 'public.provision_corporate_tenant(text,text,text,text,text,text,text,text,text,jsonb,text,text,text)'::regprocedure;
  v_legacy_acl text;
  v_new_acl text;
BEGIN
  -- PUBLIC is a keyword, not a role. A PUBLIC EXECUTE grant appears in proacl as
  -- an aclitem with an EMPTY grantee: the string starts '{=X/' or contains ',=X/'
  -- (an owner grant like 'postgres=X/postgres' has a named grantee and must NOT
  -- match). We assert no empty-grantee EXECUTE item, plus the role-level checks.
  SELECT COALESCE(proacl::text, '') INTO v_legacy_acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_or_update_corporate_tenant';

  ASSERT NOT has_function_privilege('anon', v_legacy, 'EXECUTE'),
    'C1 FAIL: anon still has EXECUTE on the legacy RPC';
  ASSERT NOT has_function_privilege('authenticated', v_legacy, 'EXECUTE'),
    'C1 FAIL: authenticated still has EXECUTE on the legacy RPC (takeover open)';
  ASSERT NOT (v_legacy_acl LIKE '{=X/%' OR v_legacy_acl LIKE '%,=X/%'),
    format('C1 FAIL: PUBLIC still has EXECUTE on the legacy RPC (empty-grantee aclitem in %s)', v_legacy_acl);
  RAISE NOTICE 'C1 PASS: PUBLIC/anon/authenticated have no EXECUTE on the legacy RPC (acl=%s)', v_legacy_acl;

  ASSERT NOT has_function_privilege('service_role', v_legacy, 'EXECUTE'),
    'C2 FAIL: service_role still has EXECUTE on the legacy RPC (unjustified retention)';
  RAISE NOTICE 'C2 PASS: service_role has no EXECUTE on the legacy RPC';

  ASSERT has_function_privilege('authenticated', v_new, 'EXECUTE'),
    'C3 FAIL: authenticated lost EXECUTE on provision_corporate_tenant (authorized path broken)';
  ASSERT NOT has_function_privilege('anon', v_new, 'EXECUTE'),
    'C3 FAIL: anon has EXECUTE on provision_corporate_tenant';
  SELECT COALESCE(proacl::text, '') INTO v_new_acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='provision_corporate_tenant';
  ASSERT NOT (v_new_acl LIKE '{=X/%' OR v_new_acl LIKE '%,=X/%'),
    format('C3 FAIL: PUBLIC has EXECUTE on provision_corporate_tenant (empty-grantee aclitem in %s)', v_new_acl);
  RAISE NOTICE 'C3 PASS: provision_corporate_tenant executable by authenticated only (not anon/PUBLIC)';
END $$;

-- C4 — behavioral denial: an authenticated caller invoking the legacy RPC gets a
-- permission error (the grant layer closes the takeover vector before any body
-- runs; the stub body would otherwise return a fake organization_id).
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_denied boolean := false;
  v_result jsonb;
BEGIN
  BEGIN
    SELECT public.create_or_update_corporate_tenant(
      'Victim Org', 'victim-org', 'Victim Legal', '00000000000100', 'BR',
      'MICRO', NULL, NULL, NULL, '{}'::jsonb, 'pt-BR', 'Core Workspace', 'Default Project'
    ) INTO v_result;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  ASSERT v_denied,
    format('C4 FAIL: authenticated caller INVOKED the legacy RPC (returned %s) — takeover vector open', v_result);
  RAISE NOTICE 'C4 PASS: authenticated caller denied (42501) invoking the legacy RPC — takeover vector closed at the grant layer';
END $$;

-- C5 — behavioral positive: the authorized path still works for authenticated.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT public.provision_corporate_tenant(
    'New Org', 'new-org', 'New Legal', '00000000000101', 'BR',
    'MICRO', NULL, NULL, NULL, '{}'::jsonb, 'pt-BR', 'Core Workspace', 'Default Project'
  ) INTO v_result;
  ASSERT v_result IS NOT NULL,
    'C5 FAIL: provision_corporate_tenant did not return for an authenticated caller';
  RAISE NOTICE 'C5 PASS: provision_corporate_tenant runs for an authenticated caller (%s)', v_result;
END $$;

RESET ROLE;

DO $$ BEGIN RAISE NOTICE '=== ALL LEGACY-RESTRICT ASSERTIONS PASSED ==='; END $$;
