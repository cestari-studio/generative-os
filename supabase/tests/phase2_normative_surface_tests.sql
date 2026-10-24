-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Phase 2 assertions for the normative catalog + web surface configuration
-- migrations. Executed as the `authenticated` (and `anon`) role with RLS
-- enforced. Any failed expectation raises and aborts (psql ON_ERROR_STOP).

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
-- 1. Normative catalog import landed with exact counts (as superuser-readable
--    counts evaluated through the authenticated role — SELECT is allowed).
-- ==========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT pg_temp.expect((SELECT count(*)::text FROM public.catalog_features), '225', 'catalog_features = 225');
SELECT pg_temp.expect((SELECT count(*)::text FROM public.catalog_operations), '100', 'catalog_operations = 100');
SELECT pg_temp.expect((SELECT count(*)::text FROM public.catalog_configurations), '200', 'catalog_configurations = 200');
SELECT pg_temp.expect((SELECT count(*)::text FROM public.catalog_pages), '60', 'catalog_pages = 60');
SELECT pg_temp.expect((SELECT count(*)::text FROM public.catalog_journeys), '30', 'catalog_journeys = 30');
SELECT pg_temp.expect((SELECT count(*)::text FROM public.catalog_entitlement_profiles), '4', 'catalog_entitlement_profiles = 4');
SELECT pg_temp.expect((SELECT count(*)::text FROM public.catalog_traceability), '225', 'catalog_traceability = 225');

-- Everything imported starts NORMATIVE_ONLY — never shown as available.
SELECT pg_temp.expect(
  (SELECT count(*)::text FROM public.catalog_features WHERE status <> 'NORMATIVE_ONLY'),
  '0',
  'all features start NORMATIVE_ONLY'
);
SELECT pg_temp.expect(
  (SELECT count(*)::text FROM public.catalog_operations WHERE status <> 'NORMATIVE_ONLY'),
  '0',
  'all operations start NORMATIVE_ONLY'
);

-- Provenance present on every record.
SELECT pg_temp.expect(
  (SELECT count(*)::text FROM public.catalog_features WHERE source_provenance->>'source_sha' = 'ffd97fa93ab425fff6bac5015d34944ef924090c'),
  '225',
  'all features carry pinned source SHA provenance'
);

-- Idempotency probe: re-applying the same seed changes zero rows (verified
-- externally by the importer's second-run report; here we assert the content
-- hash guard exists on a sample).
SELECT pg_temp.expect(
  (SELECT (count(*) = 0)::text FROM public.catalog_features f
   WHERE f.content_hash IS NULL),
  'true',
  'no null content_hash in features'
);

-- ==========================================================================
-- 2. RLS on normative tables: authenticated reads OK, writes denied for
--    non-admin, anon reads denied.
-- ==========================================================================
SELECT pg_temp.expect_error(
  $$INSERT INTO public.catalog_operations (operation_key, content_hash) VALUES ('x','z')$$,
  'authenticated non-admin cannot write catalog_operations',
  'row-level security'
);

RESET ROLE;
SET ROLE anon;
SET request.jwt.claims = '{"role":"anon"}';
SELECT pg_temp.expect(
  (SELECT count(*)::text FROM public.catalog_features),
  '0',
  'anon cannot read normative catalog (RLS deny)'
);
RESET ROLE;

-- Admin (platform_admin) can write. Fixture: grant the role to the JWT sub.
INSERT INTO public.platform_role_assignments (person_id, role_name)
VALUES ('99999999-9999-9999-9999-999999999999', 'platform_admin');

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
SELECT pg_temp.expect(
  (SELECT public.has_platform_role('platform_admin')::text),
  'true',
  'admin fixture holds platform_admin'
);

INSERT INTO public.catalog_operations (operation_key, content_hash)
VALUES ('test.admin.write', 'hash-x')
ON CONFLICT (operation_key) DO NOTHING;
SELECT pg_temp.expect(
  (SELECT count(*)::text FROM public.catalog_operations WHERE operation_key = 'test.admin.write'),
  '1',
  'platform_admin can write catalog_operations'
);
DELETE FROM public.catalog_operations WHERE operation_key = 'test.admin.write';
RESET ROLE;

-- ==========================================================================
-- 3. registry_allowlist seeded and readable; publication validation.
-- ==========================================================================
SELECT pg_temp.expect(
  (SELECT count(*)::text FROM public.registry_allowlist WHERE kind = 'template'),
  '9',
  'allowlist has 9 templates'
);
SELECT pg_temp.expect(
  (SELECT (count(*) > 0)::text FROM public.registry_allowlist WHERE kind LIKE 'endpoint:%'),
  'true',
  'allowlist has endpoints'
);

-- Surface definition with an allowlisted template works.
INSERT INTO public.surface_definitions (surface_key, route_path, template_key)
VALUES ('route.dashboard', '/dashboard', 'template.data-overview');

-- Unknown template is rejected.
SELECT pg_temp.expect_error(
  $$INSERT INTO public.surface_definitions (surface_key, route_path, template_key)
    VALUES ('route.evil', '/evil', 'template.does-not-exist')$$,
  'surface with unknown template_key is rejected',
  'allowlisted template'
);

-- ==========================================================================
-- 4. surface_revisions: publication gates.
-- ==========================================================================
-- Fixtures: one published message + one draft message.
INSERT INTO public.message_registry (message_key, locale, namespace, value, status, content_hash)
VALUES
  ('dashboard.header.title', 'en', 'dashboard', 'Dashboard', 'published', 'h1'),
  ('dashboard.header.title', 'pt-BR', 'dashboard', 'Painel', 'published', 'h2'),
  ('draft.only.message', 'en', 'dashboard', 'Draft copy', 'draft', 'h3');

RESET ROLE;

-- A valid published revision (known component + allowlisted endpoint + known
-- operation + published message) succeeds. Runs as service-capable role via
-- superuser path (publication is an admin/service action).
INSERT INTO public.operation_bindings (operation_key, endpoint_kind, endpoint_key, auth_requirement)
SELECT 'auth-context-resolve', 'endpoint:rpc', 'rpc.resolve_effective_settings', 'authenticated'
WHERE EXISTS (SELECT 1 FROM public.catalog_operations WHERE operation_key = 'auth-context-resolve');

INSERT INTO public.surface_revisions (surface_key, revision, payload, status, checksum, published_at)
VALUES (
  'route.dashboard',
  1,
  '{
    "slots": [
      {"slot_key": "kpis", "component_key": "carbon.data.kpi-tiles", "order": 1,
       "bindings": [{"resource_key": "reports.kpis", "endpoint_key": "rpc.get_tenant_payment_kpis"}]}
    ],
    "messages": ["dashboard.header.title"]
  }'::jsonb,
  'published',
  'checksum-r1',
  now()
);

SELECT pg_temp.expect(
  (SELECT count(*)::text FROM public.surface_revisions WHERE surface_key = 'route.dashboard' AND status = 'published'),
  '1',
  'valid revision publishes'
);

-- Second published revision for the same surface must fail (one published each).
SELECT pg_temp.expect_error(
  $$INSERT INTO public.surface_revisions (surface_key, revision, payload, status, checksum, published_at)
    VALUES ('route.dashboard', 2, '{"slots":[]}'::jsonb, 'published', 'c2', now())$$,
  'second published revision for the same surface is rejected'
);

-- A draft revision is allowed without full validation (incomplete by design).
INSERT INTO public.surface_revisions (surface_key, revision, payload, status, checksum)
VALUES ('route.dashboard', 3, '{"slots":[]}'::jsonb, 'draft', 'c3');

-- Publishing a payload with an unknown component_key fails closed.
SELECT pg_temp.expect_error(
  $$UPDATE public.surface_revisions
    SET status = 'published', published_at = now(),
        payload = '{"slots":[{"slot_key":"x","component_key":"carbon.unknown.widget"}]}'::jsonb
    WHERE surface_key = 'route.dashboard' AND revision = 3$$,
  'publish with unknown component_key is rejected',
  'unknown/unimplemented component_key'
);

-- Publishing a payload with an endpoint outside the allowlist fails closed.
SELECT pg_temp.expect_error(
  $$UPDATE public.surface_revisions
    SET status = 'published', published_at = now(),
        payload = '{"slots":[{"slot_key":"x","component_key":"carbon.data.kpi-tiles","bindings":[{"resource_key":"r","endpoint_key":"rpc.drop_table"}]}]}'::jsonb
    WHERE surface_key = 'route.dashboard' AND revision = 3$$,
  'publish with endpoint outside allowlist is rejected',
  'outside the allowlist'
);

-- Publishing a payload referencing a draft-only message fails closed.
SELECT pg_temp.expect_error(
  $$UPDATE public.surface_revisions
    SET status = 'published', published_at = now(),
        payload = '{"slots":[],"messages":["draft.only.message"]}'::jsonb
    WHERE surface_key = 'route.dashboard' AND revision = 3$$,
  'publish referencing non-published message is rejected',
  'without a published message'
);

-- JSX / URL / CSS / code injection in the payload is rejected.
SELECT pg_temp.expect_error(
  $$UPDATE public.surface_revisions
    SET status = 'published', published_at = now(),
        payload = '{"slots":[{"slot_key":"x","component_key":"carbon.data.kpi-tiles","note":"<script>alert(1)</script>"}]}'::jsonb
    WHERE surface_key = 'route.dashboard' AND revision = 3$$,
  'publish with JSX/HTML content is rejected',
  'forbidden content'
);

SELECT pg_temp.expect_error(
  $$UPDATE public.surface_revisions
    SET status = 'published', published_at = now(),
        payload = '{"slots":[{"slot_key":"x","component_key":"carbon.data.kpi-tiles","link":"https://evil.example/x"}]}'::jsonb
    WHERE surface_key = 'route.dashboard' AND revision = 3$$,
  'publish with arbitrary URL is rejected',
  'forbidden content'
);

-- ==========================================================================
-- 5. operation_bindings: endpoint FK integrity + evidence ladder.
-- ==========================================================================
-- Binding to a non-allowlisted endpoint fails (composite FK). Uses a fresh
-- operation so the composite FK is what fires (not the one-active index).
SELECT pg_temp.expect_error(
  $$INSERT INTO public.operation_bindings (operation_key, endpoint_kind, endpoint_key, auth_requirement)
    VALUES ('effective-config-resolve', 'endpoint:rpc', 'rpc.not_real', 'authenticated')$$,
  'binding to non-allowlisted endpoint fails',
  'operation_bindings_endpoint_fk'
);

-- Status WIRED without evidence fails.
SELECT pg_temp.expect_error(
  $$UPDATE public.operation_bindings SET status = 'WIRED' WHERE operation_key = 'auth-context-resolve'$$,
  'WIRED without evidence is rejected',
  'requires evidence'
);

-- Status WIRED with complete evidence succeeds.
UPDATE public.operation_bindings
SET status = 'WIRED',
    evidence = '{"sha":"c1bd70d88ce5c6ae88fac4befb4e820f92f41169","run_id":"39972817171","verified_at":"2026-10-23T00:00:00Z"}'::jsonb
WHERE operation_key = 'auth-context-resolve';

SELECT pg_temp.expect(
  (SELECT status::text FROM public.operation_bindings WHERE operation_key = 'auth-context-resolve'),
  'WIRED',
  'binding reaches WIRED with evidence'
);

-- A second active binding for the same operation fails (one active each).
SELECT pg_temp.expect_error(
  $$INSERT INTO public.operation_bindings (operation_key, endpoint_kind, endpoint_key, auth_requirement)
    VALUES ('auth-context-resolve', 'endpoint:edge_function', 'edge.settings-cascade', 'jwt_gateway')$$,
  'second active binding for the same operation is rejected'
);

-- Unknown operation_key in a binding fails (FK).
SELECT pg_temp.expect_error(
  $$INSERT INTO public.operation_bindings (operation_key, endpoint_kind, endpoint_key, auth_requirement)
    VALUES ('op-not-in-catalog', 'endpoint:rpc', 'rpc.create_workspace', 'authenticated')$$,
  'binding to unknown operation fails'
);

-- ==========================================================================
-- 6. message_registry: RLS exposure of published vs draft.
-- ==========================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
SELECT pg_temp.expect(
  (SELECT count(*)::text FROM public.message_registry WHERE message_key = 'draft.only.message'),
  '0',
  'non-admin authenticated cannot read draft messages'
);

RESET ROLE;
SET ROLE anon;
SET request.jwt.claims = '{"role":"anon"}';
SELECT pg_temp.expect(
  (SELECT count(*)::text FROM public.message_registry WHERE message_key = 'dashboard.header.title'),
  '2',
  'anon reads published messages (SSR of public pages)'
);
SELECT pg_temp.expect(
  (SELECT count(*)::text FROM public.message_registry WHERE message_key = 'draft.only.message'),
  '0',
  'anon cannot read draft messages'
);
RESET ROLE;

-- Invalid locale / key charset rejected.
SELECT pg_temp.expect_error(
  $$INSERT INTO public.message_registry (message_key, locale, namespace, value, status, content_hash)
    VALUES ('Bad Key', 'en', 'x', 'y', 'draft', 'h')$$,
  'message_key charset enforced'
);
SELECT pg_temp.expect_error(
  $$INSERT INTO public.message_registry (message_key, locale, namespace, value, status, content_hash)
    VALUES ('ok.key', 'english', 'x', 'y', 'draft', 'h')$$,
  'locale BCP-47 shape enforced'
);

-- ==========================================================================
-- 7. setting_normative_map: normalized cardinality.
-- ==========================================================================
-- partial mapping with two child terms.
INSERT INTO public.setting_normative_map (term_code, equivalence, rationale)
VALUES ('i18n.in_language', 'partial', 'UI locale vs content language are distinct concerns');

INSERT INTO public.setting_normative_map_terms (mapping_id, normative_config_key, relationship_role)
SELECT m.id, 'platform.default_locale', 'ui-locale'
FROM public.setting_normative_map m WHERE m.term_code = 'i18n.in_language';

INSERT INTO public.setting_normative_map_terms (mapping_id, normative_config_key, relationship_role)
SELECT m.id, 'content.default_language', 'content-language'
FROM public.setting_normative_map m WHERE m.term_code = 'i18n.in_language';

-- duplicate child rejected.
SELECT pg_temp.expect_error(
  $$INSERT INTO public.setting_normative_map_terms (mapping_id, normative_config_key, relationship_role)
    SELECT m.id, 'platform.default_locale', 'duplicate'
    FROM public.setting_normative_map m WHERE m.term_code = 'i18n.in_language'$$,
  'duplicate (mapping_id, normative_config_key) rejected'
);

-- none mapping cannot have children.
INSERT INTO public.setting_normative_map (term_code, equivalence, rationale)
VALUES ('storage.max_upload_mb', 'none', 'no normative equivalent');

SELECT pg_temp.expect_error(
  $$INSERT INTO public.setting_normative_map_terms (mapping_id, normative_config_key, relationship_role)
    SELECT m.id, 'platform.default_locale', 'should-not-work'
    FROM public.setting_normative_map m WHERE m.term_code = 'storage.max_upload_mb'$$,
  'equivalence=none rejects child terms'
);

-- child referencing an unknown normative config fails (FK).
SELECT pg_temp.expect_error(
  $$INSERT INTO public.setting_normative_map_terms (mapping_id, normative_config_key, relationship_role)
    SELECT m.id, 'no.such.config', 'x'
    FROM public.setting_normative_map m WHERE m.term_code = 'i18n.in_language'$$,
  'child with unknown normative config fails'
);

SELECT 'ALL PHASE 2 SQL TESTS PASSED' AS result;
