-- ============================================================================
-- genOS / Cestari Studio — Billing price book, usage metering and quotes
-- ============================================================================
-- Additive-only migration (direcionamento global §11): introduces the
-- versioned source of truth for prices, bundles, usage meters, credit ledger
-- and server-side quotes. Nothing existing is altered or dropped.
--
-- STATUS: pending schema reconciliation against the target project
-- (ldjfjmihdvdmltrptngf) before apply — the live schema could not be
-- introspected during authoring (MCP connected to a sibling project), so
-- every statement is idempotent (IF NOT EXISTS) and assumes only the
-- documented organizations/persons/organization_members structures.
--
-- Conventions (verified in 20261017231414 / 20261021231106):
--   * Schema.org-flavoured tables with additional_property JSONB
--   * RLS enabled on every table; SECURITY INVOKER functions
--   * auth.uid() for caller identity; organization_members for membership
--   * Monetary amounts in minor units (amount_cents BIGINT), ISO 4217 currency
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. products / product_versions — canonical genOS catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'Product' CHECK (schema_type = 'Product'),
  identifier TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  capability_code TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'retired')),
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.products IS 'Canonical genOS product/suite/feature catalog (billing-facing).';

CREATE TABLE IF NOT EXISTS public.product_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  published_at TIMESTAMPTZ,
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, version)
);
COMMENT ON TABLE public.product_versions IS 'Immutable versioned snapshots of catalog products.';

-- ---------------------------------------------------------------------------
-- 2. price_books / price_components — versioned pricing per market/currency
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'PriceSpecification' CHECK (schema_type = 'PriceSpecification'),
  identifier TEXT NOT NULL,
  version INTEGER NOT NULL,
  currency TEXT NOT NULL CHECK (char_length(currency) = 3),
  market TEXT NOT NULL DEFAULT 'global',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  effective_from TIMESTAMPTZ,
  effective_through TIMESTAMPTZ,
  published_by UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (identifier, version)
);
COMMENT ON TABLE public.price_books IS 'Versioned price books per currency/market; published versions are immutable.';

CREATE TABLE IF NOT EXISTS public.price_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_book_id UUID NOT NULL REFERENCES public.price_books(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  meter_code TEXT,
  pricing_model TEXT NOT NULL CHECK (pricing_model IN ('flat', 'per_unit', 'tiered', 'per_token', 'per_request', 'setup_fee', 'entitlement')),
  unit_label TEXT NOT NULL DEFAULT 'unit',
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  included_quantity BIGINT NOT NULL DEFAULT 0 CHECK (included_quantity >= 0),
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.price_components IS 'Per-product price component; amount in minor units, tiers as JSONB breakpoints.';

CREATE INDEX IF NOT EXISTS idx_price_components_price_book_id ON public.price_components(price_book_id);
CREATE INDEX IF NOT EXISTS idx_price_components_product_id ON public.price_components(product_id);

-- ---------------------------------------------------------------------------
-- 3. bundles / bundle_items — combos with explicit entitlements/discount
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'Offer' CHECK (schema_type = 'Offer'),
  identifier TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_book_id UUID NOT NULL REFERENCES public.price_books(id) ON DELETE RESTRICT,
  discount_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_bps BETWEEN 0 AND 10000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.bundles IS 'Combo offers referencing a price book with explicit basis-point discount.';

CREATE TABLE IF NOT EXISTS public.bundle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES public.bundles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  entitlement_quantity BIGINT NOT NULL DEFAULT 0 CHECK (entitlement_quantity >= 0),
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (bundle_id, product_id)
);
COMMENT ON TABLE public.bundle_items IS 'Products and entitlement quantities included in a bundle.';

-- ---------------------------------------------------------------------------
-- 4. usage_events / usage_aggregates — append-only metering
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  meter_code TEXT NOT NULL,
  quantity NUMERIC(24, 6) NOT NULL CHECK (quantity >= 0),
  unit_label TEXT NOT NULL DEFAULT 'unit',
  provider TEXT,
  model TEXT,
  source TEXT NOT NULL DEFAULT 'api',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.usage_events IS 'Append-only idempotent usage events; quantity from real meter sources only.';

CREATE INDEX IF NOT EXISTS idx_usage_events_org_meter_time ON public.usage_events(organization_id, meter_code, occurred_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_workspace_id ON public.usage_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_project_id ON public.usage_events(project_id);

CREATE TABLE IF NOT EXISTS public.usage_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meter_code TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  total_quantity NUMERIC(24, 6) NOT NULL DEFAULT 0,
  event_count BIGINT NOT NULL DEFAULT 0,
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, meter_code, window_start, window_end)
);
COMMENT ON TABLE public.usage_aggregates IS 'Rollups per tenant/meter/window; reconcilable from usage_events.';

-- ---------------------------------------------------------------------------
-- 5. credit_ledger — immutable grants/consumption/expiry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('grant', 'consumption', 'expiration', 'adjustment')),
  meter_code TEXT NOT NULL,
  quantity NUMERIC(24, 6) NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  reason TEXT NOT NULL,
  actor_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.credit_ledger IS 'Immutable credit grants/consumption/expiry; corrections are compensating entries, never updates.';

CREATE INDEX IF NOT EXISTS idx_credit_ledger_org_meter ON public.credit_ledger(organization_id, meter_code);

-- ---------------------------------------------------------------------------
-- 6. quotes / quote_items — server-calculated, expiring, idempotent
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'Order' CHECK (schema_type = 'Order'),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quote_kind TEXT NOT NULL DEFAULT 'catalog' CHECK (quote_kind IN ('catalog', 'manual')),
  price_book_id UUID REFERENCES public.price_books(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'accepted', 'expired', 'cancelled')),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3),
  subtotal_cents BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  discount_cents BIGINT NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  tax_cents BIGINT NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  issued_by UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quotes_kind_consistency CHECK (
    (quote_kind = 'catalog' AND price_book_id IS NOT NULL)
    OR (quote_kind = 'manual' AND price_book_id IS NULL)
  )
);
COMMENT ON TABLE public.quotes IS 'Server-issued quotes (catalog price-book or audited manual amounts); totals never client-supplied.';

CREATE TABLE IF NOT EXISTS public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  price_component_id UUID NOT NULL REFERENCES public.price_components(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC(24, 6) NOT NULL CHECK (quantity > 0),
  unit_amount_cents BIGINT NOT NULL CHECK (unit_amount_cents >= 0),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.quote_items IS 'Line items with price snapshot from the quoted price-book version.';

CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON public.quote_items(quote_id);

-- ---------------------------------------------------------------------------
-- 7. billing_admin role association (dev@cestari.studio authorization path)
-- ---------------------------------------------------------------------------
-- Platform-level admin association: billing_admin granted via a protected
-- table, never via e-mail comparison per request. The seed of the authorized
-- principal (dev@cestari.studio resolved to its real auth.users UUID) happens
-- in a separate reviewed step after identity reconciliation — no invented IDs.
CREATE TABLE IF NOT EXISTS public.platform_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL CHECK (role_name IN ('platform_admin', 'billing_admin')),
  granted_by UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (person_id, role_name)
);
COMMENT ON TABLE public.platform_role_assignments IS 'Protected platform role grants (billing_admin etc.) with audit trail.';

CREATE INDEX IF NOT EXISTS idx_platform_role_assignments_person_id ON public.platform_role_assignments(person_id);

-- ---------------------------------------------------------------------------
-- 8. billing_audit — every price/bundle/entitlement change
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'publish', 'retire', 'grant', 'revoke')),
  actor_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  request_id TEXT,
  reason TEXT,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.billing_audit IS 'Audit trail for catalog, price, bundle, entitlement and role changes.';

-- ---------------------------------------------------------------------------
-- 9. Helper: platform role check
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER justification (required by the §7.4 checklist):
--   * Why DEFINER: this helper is evaluated inside RLS policies ON
--     platform_role_assignments itself; under SECURITY INVOKER that causes
--     infinite policy recursion (policy -> function -> table -> policy).
--     DEFINER bypasses RLS for this single internal lookup, breaking the
--     recursion. SECURITY INVOKER is therefore NOT sufficient here.
--   * Hardening: SET search_path = ''; fully qualified objects; auth.uid()
--     inside the body; EXECUTE revoked from PUBLIC/anon; no table grants are
--     widened — the function only READS platform_role_assignments.
CREATE OR REPLACE FUNCTION public.has_platform_role(p_role_name text, p_person_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := coalesce(p_person_id, (SELECT auth.uid()));
BEGIN
  IF v_caller IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.platform_role_assignments pra
    WHERE pra.person_id = v_caller
      AND pra.role_name = p_role_name
      AND pra.revoked_at IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_platform_role(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_platform_role(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_platform_role(text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. RPC: issue_quote — server-side total calculation from price book
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER justification (§7.4 checklist):
--   * Why DEFINER: quotes, quote_items and billing_audit deliberately have NO
--     client INSERT/UPDATE policies — otherwise any authenticated user could
--     insert fabricated totals via PostgREST, bypassing server-side price
--     calculation. Only this RPC may write them, after validating the caller,
--     the tenant and the price data. SECURITY INVOKER cannot write here
--     without opening a direct-write policy, which is the larger risk.
--   * Hardening: SET search_path = ''; fully qualified objects; auth.uid()
--     and organization membership re-validated in the body; EXECUTE revoked
--     from PUBLIC and anon.
CREATE OR REPLACE FUNCTION public.issue_quote(
  p_organization_id uuid,
  p_price_book_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_expires_in interval DEFAULT interval '7 days',
  p_tax_cents bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_book public.price_books;
  v_quote_id uuid;
  v_item jsonb;
  v_component public.price_components;
  v_quantity numeric;
  v_line_amount bigint;
  v_subtotal bigint := 0;
  v_total bigint;
  -- progressive tier walk
  v_tier jsonb;
  v_cap numeric;
  v_prev_cap numeric;
  v_remaining numeric;
  v_units numeric;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  -- Caller must belong to the organization (billing_admin may act cross-tenant)
  IF NOT (
    public.has_platform_role('billing_admin')
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_organization_id AND om.member_id = v_caller
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of organization %', p_organization_id
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_book FROM public.price_books WHERE id = p_price_book_id AND status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Price book % is not published', p_price_book_id USING ERRCODE = '22023';
  END IF;

  -- Idempotency: return the existing quote for this key
  SELECT id INTO v_quote_id FROM public.quotes WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN (SELECT pg_catalog.jsonb_build_object(
      'quote_id', q.id, 'status', q.status, 'total_cents', q.total_cents,
      'currency', q.currency, 'idempotent_replay', true
    ) FROM public.quotes q WHERE q.id = v_quote_id);
  END IF;

  IF p_items IS NULL OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Quote requires at least one item' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.quotes (
    organization_id, quote_kind, price_book_id, idempotency_key, status, currency,
    tax_cents, expires_at, issued_by
  ) VALUES (
    p_organization_id, 'catalog', p_price_book_id, p_idempotency_key, 'issued', v_book.currency,
    greatest(p_tax_cents, 0), now() + p_expires_in, v_caller
  ) RETURNING id INTO v_quote_id;

  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_component
    FROM public.price_components
    WHERE id = (v_item ->> 'price_component_id')::uuid
      AND price_book_id = p_price_book_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Price component % not in price book %', v_item ->> 'price_component_id', p_price_book_id
        USING ERRCODE = '22023';
    END IF;

    v_quantity := (v_item ->> 'quantity')::numeric;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for component %', v_component.id USING ERRCODE = '22023';
    END IF;

    -- Server computes the line amount from the published component price.
    IF v_component.pricing_model = 'tiered' THEN
      -- Progressive per-bracket pricing. tiers JSONB is an ordered list:
      --   [{"up_to": 10, "amount_cents": 250}, {"up_to": 50, "amount_cents": 200},
      --    {"up_to": null, "amount_cents": 150}]
      -- The first 10 units are billed at 250, the next 40 at 200 and any
      -- remainder at the unbounded bracket price. up_to = null means unbounded.
      IF pg_catalog.jsonb_array_length(v_component.tiers) = 0 THEN
        RAISE EXCEPTION 'Tiered component % has no tiers defined', v_component.id USING ERRCODE = '22023';
      END IF;

      v_remaining := v_quantity;
      v_prev_cap := 0;
      v_line_amount := 0;

      FOR v_tier IN SELECT * FROM pg_catalog.jsonb_array_elements(v_component.tiers)
      LOOP
        EXIT WHEN v_remaining <= 0;

        v_cap := NULLIF(pg_catalog.btrim(v_tier ->> 'up_to'), '')::numeric;

        IF v_cap IS NULL THEN
          v_units := v_remaining;
        ELSE
          v_units := least(v_remaining, greatest(v_cap - v_prev_cap, 0));
        END IF;

        v_line_amount := v_line_amount + round(v_units * (v_tier ->> 'amount_cents')::numeric);
        v_remaining := v_remaining - v_units;

        IF v_cap IS NOT NULL THEN
          v_prev_cap := v_cap;
        END IF;
      END LOOP;

      IF v_remaining > 0 THEN
        RAISE EXCEPTION 'Quantity % exceeds all pricing tiers for component %', v_quantity, v_component.id
          USING ERRCODE = '22023';
      END IF;
    ELSE
      v_line_amount := round(v_component.amount_cents * v_quantity)::bigint;
    END IF;

    INSERT INTO public.quote_items (
      quote_id, price_component_id, product_id, quantity, unit_amount_cents, amount_cents
    ) VALUES (
      v_quote_id, v_component.id, v_component.product_id, v_quantity, v_component.amount_cents, v_line_amount
    );

    v_subtotal := v_subtotal + v_line_amount;
  END LOOP;

  v_total := v_subtotal + greatest(p_tax_cents, 0);

  UPDATE public.quotes
  SET subtotal_cents = v_subtotal, total_cents = v_total, updated_at = now()
  WHERE id = v_quote_id;

  INSERT INTO public.billing_audit (entity_type, entity_id, action, actor_id, reason, after_state)
  VALUES ('quote', v_quote_id, 'create', v_caller, 'issue_quote',
          pg_catalog.jsonb_build_object('total_cents', v_total, 'currency', v_book.currency));

  RETURN pg_catalog.jsonb_build_object(
    'quote_id', v_quote_id, 'status', 'issued', 'subtotal_cents', v_subtotal,
    'tax_cents', greatest(p_tax_cents, 0), 'total_cents', v_total,
    'currency', v_book.currency, 'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_quote(uuid, uuid, jsonb, text, interval, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_quote(uuid, uuid, jsonb, text, interval, bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.issue_quote(uuid, uuid, jsonb, text, interval, bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. RPC: record_usage_event — idempotent meter ingestion
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER justification: usage_events has no client INSERT policy
-- (metering must not be freely writable via PostgREST); only this RPC writes,
-- after validating caller and tenant. Same hardening as issue_quote.
CREATE OR REPLACE FUNCTION public.record_usage_event(
  p_event_id text,
  p_organization_id uuid,
  p_meter_code text,
  p_quantity numeric,
  p_workspace_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_person_id uuid DEFAULT NULL,
  p_unit_label text DEFAULT 'unit',
  p_provider text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_source text DEFAULT 'api',
  p_occurred_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_existing uuid;
  v_new_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_organization_id AND om.member_id = v_caller
  ) AND NOT public.has_platform_role('billing_admin') THEN
    RAISE EXCEPTION 'Access denied: not a member of organization %', p_organization_id
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_existing FROM public.usage_events WHERE event_id = p_event_id;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('usage_event_id', v_existing, 'idempotent_replay', true);
  END IF;

  INSERT INTO public.usage_events (
    event_id, organization_id, workspace_id, project_id, person_id,
    meter_code, quantity, unit_label, provider, model, source, occurred_at
  ) VALUES (
    p_event_id, p_organization_id, p_workspace_id, p_project_id,
    coalesce(p_person_id, v_caller),
    p_meter_code, p_quantity, p_unit_label, p_provider, p_model, p_source,
    coalesce(p_occurred_at, now())
  ) RETURNING id INTO v_new_id;

  RETURN pg_catalog.jsonb_build_object('usage_event_id', v_new_id, 'idempotent_replay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.record_usage_event(text, uuid, text, numeric, uuid, uuid, uuid, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_usage_event(text, uuid, text, numeric, uuid, uuid, uuid, text, text, text, text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_usage_event(text, uuid, text, numeric, uuid, uuid, uuid, text, text, text, text, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11b. RPC: issue_manual_quote — audited operator-entered amount
-- ---------------------------------------------------------------------------
-- A custom/manual charge still must not trust a browser amount field at the
-- payment step. This RPC records the operator-proposed amount as a
-- server-issued quote with an audit entry; the payment flow then consumes
-- this quote exactly like a catalog quote. DEFINER for the same reason as
-- issue_quote (no direct client writes to quotes/billing_audit).
CREATE OR REPLACE FUNCTION public.issue_manual_quote(
  p_organization_id uuid,
  p_amount_cents bigint,
  p_currency text,
  p_description text,
  p_idempotency_key text,
  p_expires_in interval DEFAULT interval '7 days'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_quote_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Manual quote requires a positive amount_cents' USING ERRCODE = '22023';
  END IF;

  IF p_currency IS NULL OR char_length(p_currency) <> 3 THEN
    RAISE EXCEPTION 'Manual quote requires an ISO 4217 currency code' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.has_platform_role('billing_admin')
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_organization_id AND om.member_id = v_caller
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of organization %', p_organization_id
      USING ERRCODE = '42501';
  END IF;

  -- Idempotency: return the existing quote for this key
  SELECT id INTO v_quote_id FROM public.quotes WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN (SELECT pg_catalog.jsonb_build_object(
      'quote_id', q.id, 'status', q.status, 'total_cents', q.total_cents,
      'currency', q.currency, 'idempotent_replay', true
    ) FROM public.quotes q WHERE q.id = v_quote_id);
  END IF;

  INSERT INTO public.quotes (
    organization_id, quote_kind, price_book_id, idempotency_key, status, currency,
    subtotal_cents, total_cents, expires_at, issued_by, additional_property
  ) VALUES (
    p_organization_id, 'manual', NULL, p_idempotency_key, 'issued', p_currency,
    p_amount_cents, p_amount_cents, now() + p_expires_in, v_caller,
    pg_catalog.jsonb_build_object('description', left(coalesce(p_description, ''), 500))
  ) RETURNING id INTO v_quote_id;

  INSERT INTO public.billing_audit (entity_type, entity_id, action, actor_id, reason, after_state)
  VALUES ('quote', v_quote_id, 'create', v_caller, 'issue_manual_quote',
          pg_catalog.jsonb_build_object('total_cents', p_amount_cents, 'currency', p_currency));

  RETURN pg_catalog.jsonb_build_object(
    'quote_id', v_quote_id, 'status', 'issued', 'total_cents', p_amount_cents,
    'currency', p_currency, 'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_manual_quote(uuid, bigint, text, text, text, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_manual_quote(uuid, bigint, text, text, text, interval) FROM anon;
GRANT EXECUTE ON FUNCTION public.issue_manual_quote(uuid, bigint, text, text, text, interval) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11c. RPC: consume_quote — validate + atomically accept a quote for payment
-- ---------------------------------------------------------------------------
-- The payment boundary (pagbank-order) calls this to bind a charge to a
-- server-issued quote. It validates tenant ownership, status and expiry and
-- flips status to 'accepted' with a compare-and-swap so a quote cannot be
-- consumed twice. Callable by the authenticated tenant member/admin and by
-- the service role (trusted backend that already authorized the request).
CREATE OR REPLACE FUNCTION public.consume_quote(
  p_quote_id uuid,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_role text := coalesce(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  v_quote public.quotes;
  v_updated uuid;
BEGIN
  IF v_caller IS NULL AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id USING ERRCODE = 'P0002';
  END IF;

  IF v_quote.organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'Quote % does not belong to organization %', p_quote_id, p_organization_id
      USING ERRCODE = '42501';
  END IF;

  -- Tenant authorization: service role (trusted backend) or member/admin.
  IF v_role <> 'service_role' AND NOT (
    public.has_platform_role('billing_admin')
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_organization_id AND om.member_id = v_caller
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of organization %', p_organization_id
      USING ERRCODE = '42501';
  END IF;

  IF v_quote.status <> 'issued' THEN
    RAISE EXCEPTION 'Quote % is not consumable (status: %)', p_quote_id, v_quote.status
      USING ERRCODE = '22023';
  END IF;

  IF v_quote.expires_at <= now() THEN
    UPDATE public.quotes SET status = 'expired', updated_at = now()
    WHERE id = p_quote_id AND status = 'issued';
    RAISE EXCEPTION 'Quote % is expired', p_quote_id USING ERRCODE = '22023';
  END IF;

  -- Compare-and-swap: exactly one consumer may flip issued -> accepted.
  UPDATE public.quotes
  SET status = 'accepted', updated_at = now()
  WHERE id = p_quote_id AND status = 'issued'
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'Quote % was already consumed', p_quote_id USING ERRCODE = '22023';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'quote_id', v_quote.id,
    'quote_kind', v_quote.quote_kind,
    'subtotal_cents', v_quote.subtotal_cents,
    'tax_cents', v_quote.tax_cents,
    'discount_cents', v_quote.discount_cents,
    'total_cents', v_quote.total_cents,
    'currency', v_quote.currency
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_quote(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_quote(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_quote(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_quote(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 12. Row Level Security
-- ---------------------------------------------------------------------------
-- Write model: usage_events, quotes, quote_items, credit_ledger and
-- billing_audit have NO direct client INSERT/UPDATE/DELETE policies — all
-- writes flow through the SECURITY DEFINER RPCs above, which validate the
-- caller, tenant and payloads server-side. Catalog tables are writable only
-- by billing_admin (draft → publish flow). Everything else is read-only for
-- org members.
-- ---------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_audit ENABLE ROW LEVEL SECURITY;

-- Catalog read: any authenticated user may read published/active catalog rows.
CREATE POLICY products_select ON public.products FOR SELECT TO authenticated
  USING (status = 'active' OR public.has_platform_role('billing_admin'));
CREATE POLICY product_versions_select ON public.product_versions FOR SELECT TO authenticated
  USING (status = 'published' OR public.has_platform_role('billing_admin'));
CREATE POLICY price_books_select ON public.price_books FOR SELECT TO authenticated
  USING (status = 'published' OR public.has_platform_role('billing_admin'));
CREATE POLICY price_components_select ON public.price_components FOR SELECT TO authenticated
  USING (public.has_platform_role('billing_admin') OR EXISTS (
    SELECT 1 FROM public.price_books pb
    WHERE pb.id = price_book_id AND pb.status = 'published'
  ));
CREATE POLICY bundles_select ON public.bundles FOR SELECT TO authenticated
  USING (status = 'published' OR public.has_platform_role('billing_admin'));
CREATE POLICY bundle_items_select ON public.bundle_items FOR SELECT TO authenticated
  USING (public.has_platform_role('billing_admin') OR EXISTS (
    SELECT 1 FROM public.bundles b WHERE b.id = bundle_id AND b.status = 'published'
  ));

-- Catalog write: billing_admin only (draft → publish flow).
CREATE POLICY products_write_admin ON public.products FOR ALL TO authenticated
  USING (public.has_platform_role('billing_admin'))
  WITH CHECK (public.has_platform_role('billing_admin'));
CREATE POLICY product_versions_write_admin ON public.product_versions FOR ALL TO authenticated
  USING (public.has_platform_role('billing_admin'))
  WITH CHECK (public.has_platform_role('billing_admin'));
CREATE POLICY price_books_write_admin ON public.price_books FOR ALL TO authenticated
  USING (public.has_platform_role('billing_admin'))
  WITH CHECK (public.has_platform_role('billing_admin'));
CREATE POLICY price_components_write_admin ON public.price_components FOR ALL TO authenticated
  USING (public.has_platform_role('billing_admin'))
  WITH CHECK (public.has_platform_role('billing_admin'));
CREATE POLICY bundles_write_admin ON public.bundles FOR ALL TO authenticated
  USING (public.has_platform_role('billing_admin'))
  WITH CHECK (public.has_platform_role('billing_admin'));
CREATE POLICY bundle_items_write_admin ON public.bundle_items FOR ALL TO authenticated
  USING (public.has_platform_role('billing_admin'))
  WITH CHECK (public.has_platform_role('billing_admin'));

-- Tenant-scoped data: members read their org rows; writes via RPC only.
CREATE POLICY usage_events_select_member ON public.usage_events FOR SELECT TO authenticated
  USING (public.has_platform_role('billing_admin') OR EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = usage_events.organization_id AND om.member_id = (SELECT auth.uid())
  ));
CREATE POLICY usage_aggregates_select_member ON public.usage_aggregates FOR SELECT TO authenticated
  USING (public.has_platform_role('billing_admin') OR EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = usage_aggregates.organization_id AND om.member_id = (SELECT auth.uid())
  ));
CREATE POLICY credit_ledger_select_member ON public.credit_ledger FOR SELECT TO authenticated
  USING (public.has_platform_role('billing_admin') OR EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = credit_ledger.organization_id AND om.member_id = (SELECT auth.uid())
  ));
CREATE POLICY quotes_select_member ON public.quotes FOR SELECT TO authenticated
  USING (public.has_platform_role('billing_admin') OR EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = quotes.organization_id AND om.member_id = (SELECT auth.uid())
  ));
CREATE POLICY quote_items_select_member ON public.quote_items FOR SELECT TO authenticated
  USING (public.has_platform_role('billing_admin') OR EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.organization_members om ON om.organization_id = q.organization_id
    WHERE q.id = quote_items.quote_id AND om.member_id = (SELECT auth.uid())
  ));

-- Role assignments: billing_admin/platform_admin manage; members read own.
CREATE POLICY platform_role_assignments_select_own ON public.platform_role_assignments FOR SELECT TO authenticated
  USING (person_id = (SELECT auth.uid()) OR public.has_platform_role('platform_admin'));
CREATE POLICY platform_role_assignments_write_admin ON public.platform_role_assignments FOR ALL TO authenticated
  USING (public.has_platform_role('platform_admin'))
  WITH CHECK (public.has_platform_role('platform_admin'));

-- Audit: billing_admin/platform_admin read; inserts via RPC/functions.
CREATE POLICY billing_audit_select_admin ON public.billing_audit FOR SELECT TO authenticated
  USING (public.has_platform_role('billing_admin') OR public.has_platform_role('platform_admin'));

-- ---------------------------------------------------------------------------
-- 13. Table-level grants (Data API exposure)
-- ---------------------------------------------------------------------------
-- RLS policies filter WHICH rows are visible; GRANTS determine WHETHER the
-- role may touch the table at all. Read access for authenticated members per
-- the SELECT policies above. No INSERT/UPDATE/DELETE grants on tenant
-- metering/quote/audit tables — writes are RPC-only by design.
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT ON public.product_versions TO authenticated;
GRANT SELECT ON public.price_books TO authenticated;
GRANT SELECT ON public.price_components TO authenticated;
GRANT SELECT ON public.bundles TO authenticated;
GRANT SELECT ON public.bundle_items TO authenticated;
GRANT SELECT ON public.usage_events TO authenticated;
GRANT SELECT ON public.usage_aggregates TO authenticated;
GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT SELECT ON public.quotes TO authenticated;
GRANT SELECT ON public.quote_items TO authenticated;
GRANT SELECT ON public.platform_role_assignments TO authenticated;
GRANT SELECT ON public.billing_audit TO authenticated;

-- Catalog write path for billing_admin (draft → publish), per the *_write_admin policies.
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_versions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.price_books TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.price_components TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bundles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bundle_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.platform_role_assignments TO authenticated;

-- Backend (service role) full access for trusted boundaries (Edge Functions).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_books TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_components TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundle_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_aggregates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_ledger TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_role_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_audit TO service_role;
