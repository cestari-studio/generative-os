-- Copyright 2026 IBM Corp. All Rights Reserved.
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

-- 1. Hardened create_pagbank_order function
CREATE OR REPLACE FUNCTION public.create_pagbank_order(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_amount_cents bigint,
  p_reference_id text,
  p_customer_snapshot jsonb,
  p_items_snapshot jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_order_id uuid;
BEGIN
  -- Strict validation of inputs
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id obrigatório' USING ERRCODE = '22004';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents deve ser maior que zero' USING ERRCODE = '22003';
  END IF;

  IF p_reference_id IS NULL OR length(trim(p_reference_id)) = 0 THEN
    RAISE EXCEPTION 'reference_id obrigatório' USING ERRCODE = '22004';
  END IF;

  -- Validate caller has access to the organization (allows service_role or authenticated member)
  IF v_caller_id IS NOT NULL AND NOT (SELECT app_private.is_org_member(p_organization_id)) THEN
    RAISE EXCEPTION 'Acesso negado para criar pedidos nesta Organização' USING ERRCODE = '42501';
  END IF;

  -- Validate workspace hierarchy if provided
  IF p_workspace_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE id = p_workspace_id AND organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'Workspace não pertence à Organização informada' USING ERRCODE = '23503';
    END IF;
  END IF;

  -- Validate project hierarchy if provided
  IF p_project_id IS NOT NULL THEN
    IF p_workspace_id IS NULL THEN
      RAISE EXCEPTION 'project_id exige que workspace_id seja informado' USING ERRCODE = '22004';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = p_project_id AND workspace_id = p_workspace_id AND organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'Projeto não pertence ao Workspace/Organização informados' USING ERRCODE = '23503';
    END IF;
  END IF;

  INSERT INTO public.payment_orders (
    organization_id,
    workspace_id,
    project_id,
    customer_person_id,
    gateway_reference_id,
    amount_cents,
    status,
    customer_snapshot,
    items_snapshot
  ) VALUES (
    p_organization_id,
    p_workspace_id,
    p_project_id,
    v_caller_id,
    p_reference_id,
    p_amount_cents,
    'draft',
    p_customer_snapshot,
    p_items_snapshot
  )
  RETURNING id INTO v_order_id;

  -- Record Schema.org Action in audit stream
  INSERT INTO public.audit_actions (
    schema_type,
    organization_id,
    workspace_id,
    project_id,
    agent_id,
    action_status,
    object_type,
    object_id,
    instrument,
    result
  ) VALUES (
    'CreateAction',
    p_organization_id,
    p_workspace_id,
    p_project_id,
    v_caller_id,
    'CompletedActionStatus',
    'Order',
    v_order_id,
    'rpc_create_pagbank_order',
    pg_catalog.jsonb_build_object(
      '@context', 'https://schema.org',
      '@type', 'Order',
      'id', v_order_id,
      'price', p_amount_cents / 100.0,
      'priceCurrency', 'BRL',
      'orderStatus', 'OrderProcessing'
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'order_id', v_order_id,
    'reference_id', p_reference_id,
    'status', 'draft'
  );
END;
$function$;

-- Revoke anonymous access to create_pagbank_order
REVOKE EXECUTE ON FUNCTION public.create_pagbank_order(uuid, uuid, uuid, bigint, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pagbank_order(uuid, uuid, uuid, bigint, text, jsonb, jsonb) TO authenticated, service_role;

-- 2. Remove unused tables from supabase_realtime publication
-- Per audit finding REALTIME-01: No frontend consumer exists; avoid broadcast overhead and unnecessary exposure.
ALTER PUBLICATION supabase_realtime DROP TABLE public.scoped_settings, public.audit_actions;
