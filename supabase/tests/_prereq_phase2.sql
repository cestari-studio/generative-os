-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Phase 2 test prerequisites (disposable DB only). Mirrors — clearly labeled —
-- of the minimal pre-existing objects the Phase 2 candidate migrations
-- reference: auth roles, set_updated_at(), has_platform_role(text),
-- platform_role_assignments, and setting_definitions (12 real term_codes).
-- Mirrors follow the shapes verified against the target project; they are
-- test scaffolding, never a runtime fallback.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS app_private;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

GRANT authenticated TO postgres;
GRANT service_role TO postgres;
GRANT anon TO postgres;

-- Mirror of public.set_updated_at() (target: trigger helper).
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Mirror of the platform role authority (target: billing migration
-- 20261022053203 — app_private helper + public SECURITY DEFINER wrapper).
CREATE TABLE IF NOT EXISTS public.platform_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL,
  role_name text NOT NULL
);

CREATE OR REPLACE FUNCTION app_private.has_platform_role(p_role_name text, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.platform_role_assignments
    WHERE person_id = p_user_id AND role_name = p_role_name
  );
END $$;

CREATE OR REPLACE FUNCTION public.has_platform_role(p_role_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  RETURN app_private.has_platform_role(p_role_name, (SELECT auth.uid()));
END $$;

-- Mirror of setting_definitions (only the columns the Phase 2 objects touch)
-- with the 12 REAL term_codes (verified against the target 2026-10-23).
CREATE TABLE IF NOT EXISTS public.setting_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_code text NOT NULL UNIQUE,
  in_defined_term_set text,
  default_value jsonb
);

INSERT INTO public.setting_definitions (term_code, in_defined_term_set) VALUES
  ('theme.header_inverse', 'theme'),
  ('theme.mode', 'theme'),
  ('storage.max_upload_mb', 'storage_vector'),
  ('i18n.in_language', 'i18n'),
  ('a11y.high_contrast', 'a11y'),
  ('a11y.reduced_motion', 'a11y'),
  ('ai.default_model', 'ai_rules'),
  ('ai.rag_top_k', 'ai_rules'),
  ('ai.system_rules', 'ai_rules'),
  ('branding.color_scheme', 'branding'),
  ('auth.require_passkey', 'auth_security'),
  ('auth.session_ttl_minutes', 'auth_security')
ON CONFLICT (term_code) DO NOTHING;

-- Mirrors of the target-native catalog tables (read-only reconciliation
-- targets for the importer diff; shapes match the live read of 2026-10-23).
CREATE TABLE IF NOT EXISTS public.catalog_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.catalog_subproducts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  product_key text NOT NULL,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.catalog_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.catalog_platform_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL
);
