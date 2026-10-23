-- ============================================================================
-- genOS / Cestari Studio — Normative catalog source (products, subproducts,
-- capabilities, platform services) with import provenance
-- ============================================================================
-- Additive-only migration: introduces the versioned, provenance-tracked
-- catalog store that the products page reads. The normative genOS registries
-- are the canonical source of identifiers; this migration persists their
-- published content so the frontend reads a backend resource binding instead
-- of the static genOsCatalog.js constant.
--
-- STATUS: pending schema reconciliation before apply (same gate as billing).
-- Validated on disposable PostgreSQL 17.11. NOT applied to any remote yet.
--
-- Conventions: additive, idempotent, RLS enabled, Schema.org-flavoured,
-- auth.uid() + organization membership for tenant-scoped writes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. catalog_versions — one row per imported catalog version
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  source_provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.catalog_versions IS 'Versioned normative catalog imports with source provenance (registry keys, version, source repo).';

-- ---------------------------------------------------------------------------
-- 2. catalog_products — 5 normative products with rich normative content
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  summary TEXT,
  problem TEXT,
  value TEXT,
  audiences JSONB NOT NULL DEFAULT '[]'::jsonb,
  boundaries JSONB NOT NULL DEFAULT '[]'::jsonb,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  kpis JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'normative',
  source_provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.catalog_products IS 'Normative product catalog (5 products) from the genOS product-registry, with rich normative content and import provenance.';

-- ---------------------------------------------------------------------------
-- 3. catalog_subproducts — 30 normative subproducts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_subproducts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  product_key TEXT NOT NULL REFERENCES public.catalog_products(key) ON DELETE CASCADE,
  name TEXT NOT NULL,
  summary TEXT,
  actors JSONB NOT NULL DEFAULT '[]'::jsonb,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  feature_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'normative',
  maturity TEXT,
  source_provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.catalog_subproducts IS 'Normative subproduct catalog (30 subproducts) linked to catalog_products by product_key.';

CREATE INDEX IF NOT EXISTS idx_catalog_subproducts_product_key ON public.catalog_subproducts(product_key);

-- ---------------------------------------------------------------------------
-- 4. catalog_capabilities — 9 shared capabilities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  summary TEXT,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  feature_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'normative',
  maturity TEXT,
  source_provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.catalog_capabilities IS 'Normative shared capabilities (9) from the genOS capability-registry.';

-- ---------------------------------------------------------------------------
-- 5. catalog_platform_services — 6 platform services
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_platform_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  summary TEXT,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  feature_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'normative',
  maturity TEXT,
  source_provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.catalog_platform_services IS 'Normative platform services (6) from the genOS platform-service-registry.';

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------
-- Normative catalog content is product-level (not tenant data): any
-- authenticated user may READ the published catalog. Writes are admin-only
-- (import/maintenance), via a dedicated role — members never write catalog
-- content through the client.
ALTER TABLE public.catalog_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_subproducts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_platform_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_versions_select ON public.catalog_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY catalog_products_select ON public.catalog_products FOR SELECT TO authenticated USING (true);
CREATE POLICY catalog_subproducts_select ON public.catalog_subproducts FOR SELECT TO authenticated USING (true);
CREATE POLICY catalog_capabilities_select ON public.catalog_capabilities FOR SELECT TO authenticated USING (true);
CREATE POLICY catalog_platform_services_select ON public.catalog_platform_services FOR SELECT TO authenticated USING (true);

-- Catalog content is normative/product data; only a platform/billing admin
-- may write (import/update). The read path is the only one the products page
-- uses; imports happen via a controlled seed/migration path, not the client.
CREATE POLICY catalog_versions_admin ON public.catalog_versions FOR ALL TO authenticated
  USING (public.has_platform_role('platform_admin'))
  WITH CHECK (public.has_platform_role('platform_admin'));
CREATE POLICY catalog_products_admin ON public.catalog_products FOR ALL TO authenticated
  USING (public.has_platform_role('platform_admin'))
  WITH CHECK (public.has_platform_role('platform_admin'));
CREATE POLICY catalog_subproducts_admin ON public.catalog_subproducts FOR ALL TO authenticated
  USING (public.has_platform_role('platform_admin'))
  WITH CHECK (public.has_platform_role('platform_admin'));
CREATE POLICY catalog_capabilities_admin ON public.catalog_capabilities FOR ALL TO authenticated
  USING (public.has_platform_role('platform_admin'))
  WITH CHECK (public.has_platform_role('platform_admin'));
CREATE POLICY catalog_platform_services_admin ON public.catalog_platform_services FOR ALL TO authenticated
  USING (public.has_platform_role('platform_admin'))
  WITH CHECK (public.has_platform_role('platform_admin'));

-- ---------------------------------------------------------------------------
-- 7. Table-level grants (Data API exposure per RLS above)
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.catalog_versions TO authenticated;
GRANT SELECT ON public.catalog_products TO authenticated;
GRANT SELECT ON public.catalog_subproducts TO authenticated;
GRANT SELECT ON public.catalog_capabilities TO authenticated;
GRANT SELECT ON public.catalog_platform_services TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.catalog_versions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.catalog_products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.catalog_subproducts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.catalog_capabilities TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.catalog_platform_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_subproducts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_capabilities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_platform_services TO service_role;
