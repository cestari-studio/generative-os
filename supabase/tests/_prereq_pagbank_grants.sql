-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the
-- root directory of this source tree.
--
-- Prerequisites for the pagbank service_role-only grant test (disposable DB only).
-- Provides auth roles + stub claim_pagbank_order / attach_psp_idempotency with the
-- SAME signatures as the live functions (the grant migration operates on them).

\ir _prereq.sql

GRANT USAGE ON SCHEMA auth TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role, anon;

-- payment_orders stub (referenced by the function bodies)
DROP TABLE IF EXISTS public.payment_orders CASCADE;
CREATE TABLE public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  workspace_id uuid,
  project_id uuid,
  customer_person_id uuid,
  gateway_reference_id text UNIQUE,
  psp_idempotency_key text,
  psp_payload_fingerprint text,
  status text NOT NULL DEFAULT 'draft',
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  quote_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- quotes stub
DROP TABLE IF EXISTS public.quotes CASCADE;
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  total_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Stub claim_pagbank_order (same signature + DEFINER as live; body simplified to a no-op claim)
CREATE OR REPLACE FUNCTION public.claim_pagbank_order(
  p_organization_id uuid, p_workspace_id uuid, p_project_id uuid, p_quote_id uuid,
  p_reference_id text, p_customer_person_id uuid, p_customer_snapshot jsonb, p_items_snapshot jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_order_id uuid;
BEGIN
  INSERT INTO public.payment_orders (organization_id, workspace_id, project_id, quote_id, customer_person_id, gateway_reference_id, customer_snapshot, items_snapshot)
  VALUES (p_organization_id, p_workspace_id, p_project_id, p_quote_id, p_customer_person_id, p_reference_id, p_customer_snapshot, p_items_snapshot)
  RETURNING id INTO v_order_id;
  RETURN pg_catalog.jsonb_build_object('order_id', v_order_id, 'claimed', true);
END; $$;

-- Stub attach_psp_idempotency (same signature + DEFINER as live)
CREATE OR REPLACE FUNCTION public.attach_psp_idempotency(
  p_order_id uuid, p_organization_id uuid, p_psp_idempotency_key text, p_psp_payload_fingerprint text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.payment_orders
  SET psp_idempotency_key = p_psp_idempotency_key, psp_payload_fingerprint = p_psp_payload_fingerprint
  WHERE id = p_order_id AND organization_id = p_organization_id;
  RETURN pg_catalog.jsonb_build_object('attached', true);
END; $$;

-- Simulate the LIVE (pre-fix) state: both functions are executable by authenticated.
GRANT EXECUTE ON FUNCTION public.claim_pagbank_order(uuid, uuid, uuid, uuid, text, uuid, jsonb, jsonb) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attach_psp_idempotency(uuid, uuid, text, text) TO PUBLIC, anon, authenticated, service_role;

-- Grants so the test's service_role subqueries + the function bodies can read/write.
GRANT SELECT ON public.quotes TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_orders TO service_role, authenticated;

-- Seed data for service_role happy-path
INSERT INTO auth.users (id) VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO public.quotes (organization_id, status, total_cents) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'open', 1000);
