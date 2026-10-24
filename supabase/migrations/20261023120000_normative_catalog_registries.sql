-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- 20261023120000_normative_catalog_registries.sql
--
-- Phase 2 candidate (ADDITIVE ONLY): normative catalog registries imported
-- from cestari-studio/genOS @ ffd97fa93ab425fff6bac5015d34944ef924090c
-- (registries v0.9.0 + dispositions v0.9.1). Source reconciliation:
-- docs/phase2-source-reconciliation-report.md
--
-- These tables hold NORMATIVE METADATA ONLY. A row here never means the
-- feature/operation is implemented, wired or available in the runtime.
-- Maturity states: NORMATIVE_ONLY, MAPPED_UNVERIFIED, CONFIGURED, WIRED,
-- INTEGRATION_VERIFIED, E2E_VERIFIED, BLOCKED, DEPRECATED.
--
-- No existing table, policy, RPC or grant is altered.

-- ---------------------------------------------------------------------------
-- Maturity state enum (shared by all normative registry tables)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'normative_maturity_state') THEN
    CREATE TYPE normative_maturity_state AS ENUM (
      'NORMATIVE_ONLY',
      'MAPPED_UNVERIFIED',
      'CONFIGURED',
      'WIRED',
      'INTEGRATION_VERIFIED',
      'E2E_VERIFIED',
      'BLOCKED',
      'DEPRECATED'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 225 feature definitions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  domain_type text NOT NULL,
  product_key text,
  subproduct_key text,
  name text NOT NULL,
  summary text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status normative_maturity_state NOT NULL DEFAULT 'NORMATIVE_ONLY',
  maturity text,
  content_hash text NOT NULL,
  source_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 100 canonical operations (metadata; never an endpoint by itself)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_key text NOT NULL UNIQUE,
  domain text,
  access text,
  execution text,
  bundle text,
  summary text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status normative_maturity_state NOT NULL DEFAULT 'NORMATIVE_ONLY',
  content_hash text NOT NULL,
  source_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 200 normative configuration definitions (REFERENCE ONLY — never an
-- effective value; the 12 setting_definitions remain the sole authority)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text NOT NULL UNIQUE,
  config_class text,
  value_type text,
  default_value text,
  allowed_scopes text,
  resolution text,
  purpose text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status normative_maturity_state NOT NULL DEFAULT 'NORMATIVE_ONLY',
  content_hash text NOT NULL,
  source_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 60 normative page keys (traceability references, NOT physical routes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_key text NOT NULL UNIQUE,
  route text,
  label text,
  purpose text,
  cascade text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status normative_maturity_state NOT NULL DEFAULT 'NORMATIVE_ONLY',
  content_hash text NOT NULL,
  source_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 30 journeys
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_key text NOT NULL UNIQUE,
  name text NOT NULL,
  summary text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status normative_maturity_state NOT NULL DEFAULT 'NORMATIVE_ONLY',
  content_hash text NOT NULL,
  source_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4 entitlement profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_entitlement_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key text NOT NULL UNIQUE,
  name text NOT NULL,
  summary text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status normative_maturity_state NOT NULL DEFAULT 'NORMATIVE_ONLY',
  content_hash text NOT NULL,
  source_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 225 traceability rows (feature <-> product/subproduct/operation/page)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_traceability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL REFERENCES public.catalog_features(feature_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  product_key text,
  subproduct_key text,
  operation_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  page_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  configuration_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  source_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_traceability_feature_key_unique UNIQUE (feature_key)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS catalog_features_product_key_idx ON public.catalog_features (product_key);
CREATE INDEX IF NOT EXISTS catalog_features_subproduct_key_idx ON public.catalog_features (subproduct_key);
CREATE INDEX IF NOT EXISTS catalog_features_status_idx ON public.catalog_features (status);
CREATE INDEX IF NOT EXISTS catalog_operations_status_idx ON public.catalog_operations (status);
CREATE INDEX IF NOT EXISTS catalog_configurations_class_idx ON public.catalog_configurations (config_class);
CREATE INDEX IF NOT EXISTS catalog_pages_cascade_idx ON public.catalog_pages (cascade);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuses existing public.set_updated_at())
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalog_features',
    'catalog_operations',
    'catalog_configurations',
    'catalog_pages',
    'catalog_journeys',
    'catalog_entitlement_profiles',
    'catalog_traceability'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- RLS — mirror the existing catalog exposure model: authenticated reads,
-- writes restricted to platform admins (has_platform_role) or service role.
-- Anonymous reads are denied (verified behavior of catalog_products today).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalog_features',
    'catalog_operations',
    'catalog_configurations',
    'catalog_pages',
    'catalog_journeys',
    'catalog_entitlement_profiles',
    'catalog_traceability'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_select_authenticated',
      t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write_admin', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_platform_role(''platform_admin'')) WITH CHECK (public.has_platform_role(''platform_admin''))',
      t || '_write_admin',
      t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Grants — mirror the target's established Data API model: table privileges
-- for anon/authenticated/service_role with RLS as the sole access gate
-- (verified on catalog_products 2026-10-23: anon has privileges but receives
-- zero rows because no anon policy exists).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalog_features',
    'catalog_operations',
    'catalog_configurations',
    'catalog_pages',
    'catalog_journeys',
    'catalog_entitlement_profiles',
    'catalog_traceability'
  ]
  LOOP
    EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated, service_role', t);
  END LOOP;
END $$;
