-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the root directory of this source tree.
--
-- Destination implementation overlay for canonical feature/page/operation links.
-- This is not a copy of genOS runtime, migrations, seeds, or generated IDs.
-- The stable string keys are references to the read-only normative traceability registry.
--
-- Additive-only. The row set is intentionally small and statused; never infer
-- a complete 60-page / 100-operation / 225-feature implementation from this table.

CREATE TABLE public.catalog_feature_bindings (
  feature_key TEXT NOT NULL CHECK (btrim(feature_key) <> ''),
  page_key TEXT NOT NULL CHECK (btrim(page_key) <> ''),
  operation_id TEXT NOT NULL CHECK (btrim(operation_id) <> ''),
  app_route TEXT NOT NULL CHECK (app_route LIKE '/%'),
  component_name TEXT NOT NULL CHECK (btrim(component_name) <> ''),
  runtime_ref TEXT NOT NULL CHECK (btrim(runtime_ref) <> ''),
  binding_status TEXT NOT NULL DEFAULT 'implemented_unverified'
    CHECK (binding_status IN ('candidate', 'implemented_unverified', 'validated', 'blocked')),
  source_registry TEXT NOT NULL CHECK (source_registry = 'registry.traceability'),
  source_registry_version TEXT NOT NULL,
  source_provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_key, page_key, operation_id, app_route)
);

COMMENT ON TABLE public.catalog_feature_bindings IS
  'Destination-side implementation mappings from canonical feature/page/operation keys to actual application routes and runtime adapters. It is not the canonical registry.';
COMMENT ON COLUMN public.catalog_feature_bindings.binding_status IS
  'candidate=proposed mapping; implemented_unverified=code mapping exists but runtime/E2E proof is pending; validated=all release gates have evidence; blocked=explicitly unavailable.';
COMMENT ON COLUMN public.catalog_feature_bindings.source_provenance IS
  'Records the canonical registry source and destination code evidence; no upstream runtime/IDs are imported.';

ALTER TABLE public.catalog_feature_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_feature_bindings FORCE ROW LEVEL SECURITY;

CREATE POLICY catalog_feature_bindings_authenticated_read
  ON public.catalog_feature_bindings
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY catalog_feature_bindings_platform_admin_write
  ON public.catalog_feature_bindings
  FOR ALL TO authenticated
  USING (public.has_platform_role('platform_admin'))
  WITH CHECK (public.has_platform_role('platform_admin'));

REVOKE ALL ON TABLE public.catalog_feature_bindings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_feature_bindings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_feature_bindings TO service_role;
