-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Supabase-compatible prerequisites for billing SQL tests (disposable DB only).
-- Provides the auth schema/roles and the minimal tenant tables the billing
-- migration references. Mirrors the shapes in 20261017231414.
CREATE SCHEMA IF NOT EXISTS auth;
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

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id)
);
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id)
);
CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE
);

-- Mirror of the remote exposure model for the membership table (verified
-- against the target project): readable by authenticated, rows filtered by
-- RLS. The policy is created by billing_fixtures.sql after the migration
-- provides has_platform_role.
GRANT SELECT ON public.organization_members TO authenticated;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Authoritative payment_orders shape (verified against the target project
-- 2026-10-22): gateway_reference_id UNIQUE, status CHECK in
-- ('draft','waiting_payment','paid','canceled','refunded').
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid,
  project_id uuid,
  customer_person_id uuid,
  gateway_reference_id text NOT NULL UNIQUE,
  pagbank_order_id text,
  currency text NOT NULL DEFAULT 'BRL',
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status = ANY (ARRAY['draft','waiting_payment','paid','canceled','refunded'])),
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  quote_id uuid,
  psp_idempotency_key text,
  psp_payload_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The write path for orders is backend-only (service role / admin client in
-- the real system, verified 2026-10-22). Members never read/write directly.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_orders TO service_role;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_orders_service_all ON public.payment_orders;
CREATE POLICY payment_orders_service_all ON public.payment_orders FOR ALL TO service_role
  USING (true) WITH CHECK (true);
