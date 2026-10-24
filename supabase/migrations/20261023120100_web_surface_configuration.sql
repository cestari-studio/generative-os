-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- 20261023120100_web_surface_configuration.sql
--
-- Phase 2 candidate (ADDITIVE ONLY): operational web configuration layer
-- (Camada B) per docs/phase1-configuration-contract.md v1.1.
--
--   surface_definitions / surface_revisions  — composition of existing
--     physical surfaces (draft -> published -> archived, one published each)
--   registry_allowlist                       — server-side mirror of the
--     code-owned registries (src/config/runtime-registries.js), seeded from a
--     generated file with checksum; code remains the authority
--   operation_bindings                       — typed operation -> endpoint
--     wiring with evidence, never an endpoint by itself
--   message_registry                         — authoritative localized copy
--   setting_normative_map(+_terms)           — 12 target settings <-> normative
--     configuration references (normalized, see contract addendum v1.1)
--
-- The DB stores KEYS ONLY. No JSX, imports, arbitrary URLs, CSS, SQL or
-- executable code may be stored in configuration payloads — enforced by the
-- publication validator below.
--
-- Depends on: 20261023120000_normative_catalog_registries.sql
--             20261022053203_billing_pricebook_usage_metering.sql (has_platform_role)
-- No existing table, policy, RPC or grant is altered.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'surface_revision_status') THEN
    CREATE TYPE surface_revision_status AS ENUM ('draft', 'published', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_status') THEN
    CREATE TYPE message_status AS ENUM ('draft', 'published', 'deprecated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'operation_binding_status') THEN
    CREATE TYPE operation_binding_status AS ENUM (
      'MAPPED_UNVERIFIED',
      'CONFIGURED',
      'WIRED',
      'INTEGRATION_VERIFIED',
      'E2E_VERIFIED',
      'BLOCKED',
      'DEPRECATED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'setting_equivalence') THEN
    CREATE TYPE setting_equivalence AS ENUM ('exact', 'partial', 'none');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- registry_allowlist — generated mirror of the code-owned registries.
-- Populated by the checked-in generated SQL (provenance + checksum); the CI
-- drift test regenerates and compares byte-for-byte. Never hand-edited.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.registry_allowlist (
  kind text NOT NULL, -- 'template' | 'component' | 'route' | 'endpoint:rpc' | 'endpoint:edge_function' | 'endpoint:public_projection'
  key text NOT NULL,
  status text NOT NULL, -- contract_only | mock | implemented | tested | deprecated
  registry_version text NOT NULL,
  content_checksum text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registry_allowlist_pkey PRIMARY KEY (kind, key),
  CONSTRAINT registry_allowlist_kind_check CHECK (
    kind IN ('template', 'component', 'route', 'endpoint:rpc', 'endpoint:edge_function', 'endpoint:public_projection')
  ),
  CONSTRAINT registry_allowlist_key_charset CHECK (key ~ '^[a-z0-9_./*:-]+$')
);

-- ---------------------------------------------------------------------------
-- surface_definitions — identity of the EXISTING physical surfaces
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.surface_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface_key text NOT NULL UNIQUE,
  route_path text NOT NULL,
  template_key text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surface_definitions_key_charset CHECK (surface_key ~ '^[a-z0-9_.:-]+$')
);

COMMENT ON TABLE public.surface_definitions IS
  'Identities of the existing physical surfaces (route allowlist). The DB chooses among code-owned templates; it can never create a new path or import.';

-- template_key must reference an allowlisted template (kind='template'). The
-- allowlist PK is (kind, key), so a plain FK on key alone is impossible;
-- enforce via trigger instead.
CREATE OR REPLACE FUNCTION public.enforce_surface_template_allowlist()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.registry_allowlist
    WHERE kind = 'template' AND key = NEW.template_key AND status IN ('implemented', 'tested')
  ) THEN
    RAISE EXCEPTION 'surface_definitions.template_key % is not an allowlisted template', NEW.template_key;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS surface_template_allowlist ON public.surface_definitions;
CREATE TRIGGER surface_template_allowlist
  BEFORE INSERT OR UPDATE ON public.surface_definitions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_surface_template_allowlist();

-- ---------------------------------------------------------------------------
-- surface_revisions — versioned composition payloads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.surface_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface_key text NOT NULL REFERENCES public.surface_definitions(surface_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  revision integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{"slots":[]}'::jsonb,
  status surface_revision_status NOT NULL DEFAULT 'draft',
  checksum text NOT NULL,
  published_at timestamptz,
  published_by uuid,
  supersedes uuid REFERENCES public.surface_revisions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surface_revisions_surface_revision_unique UNIQUE (surface_key, revision),
  CONSTRAINT surface_revisions_revision_positive CHECK (revision > 0),
  CONSTRAINT surface_revisions_published_fields CHECK (
    (status = 'published') = (published_at IS NOT NULL)
  )
);

-- Exactly one published revision per surface.
CREATE UNIQUE INDEX IF NOT EXISTS surface_revisions_one_published_per_surface
  ON public.surface_revisions (surface_key)
  WHERE status = 'published';

-- ---------------------------------------------------------------------------
-- Publication validator — runs before a revision may become (or stay)
-- published. Fail-closed: any unknown key or forbidden content aborts.
--   payload shape (closed):
--   {
--     "slots": [
--       { "slot_key": "header", "component_key": "carbon.data.data-table",
--         "order": 1,
--         "bindings": [ {"resource_key":"...","endpoint_key":"rpc.x","params":{...}} ],
--         "actions":  [ {"action_key":"...","operation_key":"...","message_key":"..."} ] }
--     ],
--     "messages": ["dashboard.header.title", ...]
--   }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_surface_revision_payload(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_slot jsonb;
  v_binding jsonb;
  v_action jsonb;
  v_message_key text;
  v_forbidden text[] := ARRAY['<', 'javascript:', 'data:text/html', '@import', 'expression(', 'http://', 'https://', 'style=', 'function(', '=>'];
  v_pattern text;
  v_key_re text := '^[a-z0-9_.:*-]+$';
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'surface revision payload must be a jsonb object';
  END IF;

  -- Global deny-list on the serialized payload (blocks JSX, URLs, CSS, code).
  FOREACH v_pattern IN ARRAY v_forbidden LOOP
    IF position(lower(v_pattern) IN lower(p_payload::text)) > 0 THEN
      RAISE EXCEPTION 'surface revision payload contains forbidden content: %', v_pattern;
    END IF;
  END LOOP;

  IF p_payload ? 'slots' AND jsonb_typeof(p_payload->'slots') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'payload.slots must be an array';
  END IF;

  IF p_payload ? 'slots' THEN
    FOR v_slot IN SELECT value FROM jsonb_array_elements(p_payload->'slots') LOOP
      IF (v_slot->>'slot_key') IS NULL OR (v_slot->>'slot_key') !~ v_key_re THEN
        RAISE EXCEPTION 'slot has missing/invalid slot_key: %', v_slot;
      END IF;
      IF (v_slot->>'component_key') IS NULL OR (v_slot->>'component_key') !~ v_key_re THEN
        RAISE EXCEPTION 'slot % has missing/invalid component_key', v_slot->>'slot_key';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.registry_allowlist
        WHERE kind = 'component' AND key = v_slot->>'component_key' AND status IN ('implemented', 'tested')
      ) THEN
        RAISE EXCEPTION 'slot % references unknown/unimplemented component_key %',
          v_slot->>'slot_key', v_slot->>'component_key';
      END IF;

      IF v_slot ? 'bindings' THEN
        FOR v_binding IN SELECT value FROM jsonb_array_elements(v_slot->'bindings') LOOP
          IF (v_binding->>'resource_key') IS NULL OR (v_binding->>'resource_key') !~ v_key_re THEN
            RAISE EXCEPTION 'binding in slot % has missing/invalid resource_key', v_slot->>'slot_key';
          END IF;
          IF (v_binding->>'endpoint_key') IS NULL OR (v_binding->>'endpoint_key') !~ v_key_re THEN
            RAISE EXCEPTION 'binding % in slot % has missing/invalid endpoint_key',
              v_binding->>'resource_key', v_slot->>'slot_key';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM public.registry_allowlist
            WHERE kind LIKE 'endpoint:%' AND key = v_binding->>'endpoint_key' AND status IN ('implemented', 'tested')
          ) THEN
            RAISE EXCEPTION 'binding % in slot % references endpoint outside the allowlist: %',
              v_binding->>'resource_key', v_slot->>'slot_key', v_binding->>'endpoint_key';
          END IF;
          IF v_binding ? 'params' AND jsonb_typeof(v_binding->'params') IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'binding % params must be an object of scalar values', v_binding->>'resource_key';
          END IF;
        END LOOP;
      END IF;

      IF v_slot ? 'actions' THEN
        FOR v_action IN SELECT value FROM jsonb_array_elements(v_slot->'actions') LOOP
          IF (v_action->>'action_key') IS NULL OR (v_action->>'action_key') !~ v_key_re THEN
            RAISE EXCEPTION 'action in slot % has missing/invalid action_key', v_slot->>'slot_key';
          END IF;
          IF (v_action->>'operation_key') IS NULL OR (v_action->>'operation_key') !~ v_key_re THEN
            RAISE EXCEPTION 'action % in slot % has missing/invalid operation_key',
              v_action->>'action_key', v_slot->>'slot_key';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM public.catalog_operations WHERE operation_key = v_action->>'operation_key'
          ) THEN
            RAISE EXCEPTION 'action % references unknown operation_key %',
              v_action->>'action_key', v_action->>'operation_key';
          END IF;
          IF (v_action->>'message_key') IS NULL OR (v_action->>'message_key') !~ v_key_re THEN
            RAISE EXCEPTION 'action % has missing/invalid message_key', v_action->>'action_key';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM public.message_registry
            WHERE message_key = v_action->>'message_key' AND status = 'published'
          ) THEN
            RAISE EXCEPTION 'action % references message_key without a published message: %',
              v_action->>'action_key', v_action->>'message_key';
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  IF p_payload ? 'messages' THEN
    IF jsonb_typeof(p_payload->'messages') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'payload.messages must be an array';
    END IF;
    FOR v_message_key IN SELECT value FROM jsonb_array_elements_text(p_payload->'messages') LOOP
      IF v_message_key !~ v_key_re THEN
        RAISE EXCEPTION 'invalid message_key in payload.messages: %', v_message_key;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.message_registry
        WHERE message_key = v_message_key AND status = 'published'
      ) THEN
        RAISE EXCEPTION 'payload references message_key without a published message: %', v_message_key;
      END IF;
    END LOOP;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_surface_revision_payload(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_surface_revision_publication()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status = 'published' THEN
    PERFORM public.validate_surface_revision_payload(NEW.payload);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_publication ON public.surface_revisions;
CREATE TRIGGER validate_publication
  BEFORE INSERT OR UPDATE ON public.surface_revisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_surface_revision_publication();

-- ---------------------------------------------------------------------------
-- message_registry — authoritative localized copy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_key text NOT NULL,
  locale text NOT NULL,
  namespace text NOT NULL,
  value text NOT NULL,
  status message_status NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  content_hash text NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_registry_key_locale_unique UNIQUE (message_key, locale),
  CONSTRAINT message_registry_key_charset CHECK (message_key ~ '^[a-z0-9_.:-]+$'),
  CONSTRAINT message_registry_locale_bcp47 CHECK (locale ~ '^[a-z]{2,3}(-[A-Z][a-zA-Z0-9]+)*$'),
  CONSTRAINT message_registry_version_positive CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS message_registry_namespace_idx ON public.message_registry (namespace);
CREATE INDEX IF NOT EXISTS message_registry_status_locale_idx ON public.message_registry (status, locale);

-- ---------------------------------------------------------------------------
-- operation_bindings — typed operation -> endpoint wiring with evidence
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.operation_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_key text NOT NULL REFERENCES public.catalog_operations(operation_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  endpoint_kind text NOT NULL,
  endpoint_key text NOT NULL,
  auth_requirement text NOT NULL,
  tenant_context text,
  entitlement_key text,
  idempotency_rule text,
  cache_rule text,
  failure_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  status operation_binding_status NOT NULL DEFAULT 'MAPPED_UNVERIFIED',
  owner text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operation_bindings_endpoint_fk FOREIGN KEY (endpoint_kind, endpoint_key)
    REFERENCES public.registry_allowlist (kind, key) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT operation_bindings_endpoint_kind_check CHECK (endpoint_kind LIKE 'endpoint:%'),
  CONSTRAINT operation_bindings_entitlement_fk FOREIGN KEY (entitlement_key)
    REFERENCES public.catalog_entitlement_profiles(profile_key) ON UPDATE CASCADE ON DELETE SET NULL
);

-- At most one active (non-deprecated/BLOCKED) binding per operation.
CREATE UNIQUE INDEX IF NOT EXISTS operation_bindings_one_active_per_operation
  ON public.operation_bindings (operation_key)
  WHERE status NOT IN ('DEPRECATED', 'BLOCKED');

CREATE INDEX IF NOT EXISTS operation_bindings_status_idx ON public.operation_bindings (status);

-- Status ladder guard: evidence required for verified states.
CREATE OR REPLACE FUNCTION public.enforce_operation_binding_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status IN ('WIRED', 'INTEGRATION_VERIFIED', 'E2E_VERIFIED') THEN
    IF NEW.evidence IS NULL OR NEW.evidence = '{}'::jsonb
      OR NEW.evidence->>'sha' IS NULL OR NEW.evidence->>'run_id' IS NULL THEN
      RAISE EXCEPTION 'operation_binding status % requires evidence {sha, run_id, verified_at}', NEW.status;
    END IF;
    IF NEW.evidence->>'verified_at' IS NULL THEN
      RAISE EXCEPTION 'operation_binding status % requires evidence.verified_at', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS operation_binding_evidence ON public.operation_bindings;
CREATE TRIGGER operation_binding_evidence
  BEFORE INSERT OR UPDATE ON public.operation_bindings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_operation_binding_evidence();

-- ---------------------------------------------------------------------------
-- setting_normative_map (+ _terms) — normalized per contract addendum v1.1
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.setting_normative_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_code text NOT NULL UNIQUE REFERENCES public.setting_definitions(term_code) ON UPDATE CASCADE ON DELETE RESTRICT,
  equivalence setting_equivalence NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.setting_normative_map_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id uuid NOT NULL REFERENCES public.setting_normative_map(id) ON UPDATE CASCADE ON DELETE CASCADE,
  normative_config_key text NOT NULL REFERENCES public.catalog_configurations(config_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  relationship_role text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT setting_normative_map_terms_unique UNIQUE (mapping_id, normative_config_key)
);

-- A 'none' equivalence must have zero child terms; enforced by trigger.
CREATE OR REPLACE FUNCTION public.enforce_setting_map_none_has_no_terms()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.setting_normative_map m
    WHERE m.id = NEW.mapping_id AND m.equivalence = 'none'
  ) THEN
    RAISE EXCEPTION 'setting_normative_map with equivalence=none cannot have child terms';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS setting_map_none_terms ON public.setting_normative_map_terms;
CREATE TRIGGER setting_map_none_terms
  BEFORE INSERT ON public.setting_normative_map_terms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_setting_map_none_has_no_terms();

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'surface_definitions',
    'surface_revisions',
    'message_registry',
    'operation_bindings',
    'setting_normative_map'
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
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.registry_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setting_normative_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setting_normative_map_terms ENABLE ROW LEVEL SECURITY;

-- registry_allowlist: readable by all roles that render (incl. anon for
-- public surface validation); writes only via service/admin.
DROP POLICY IF EXISTS registry_allowlist_select ON public.registry_allowlist;
CREATE POLICY registry_allowlist_select ON public.registry_allowlist
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS registry_allowlist_write_admin ON public.registry_allowlist;
CREATE POLICY registry_allowlist_write_admin ON public.registry_allowlist
  FOR ALL TO authenticated
  USING (public.has_platform_role('platform_admin'))
  WITH CHECK (public.has_platform_role('platform_admin'));

-- surfaces: authenticated reads (public surfaces are rendered by the server,
-- which uses the caller's context; public read of definitions is allowed so
-- SSR can resolve public surfaces).
DROP POLICY IF EXISTS surface_definitions_select ON public.surface_definitions;
CREATE POLICY surface_definitions_select ON public.surface_definitions
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS surface_definitions_write_admin ON public.surface_definitions;
CREATE POLICY surface_definitions_write_admin ON public.surface_definitions
  FOR ALL TO authenticated
  USING (public.has_platform_role('platform_admin'))
  WITH CHECK (public.has_platform_role('platform_admin'));

DROP POLICY IF EXISTS surface_revisions_select ON public.surface_revisions;
CREATE POLICY surface_revisions_select ON public.surface_revisions
  FOR SELECT TO anon, authenticated USING (status = 'published');
DROP POLICY IF EXISTS surface_revisions_read_drafts_admin ON public.surface_revisions;
CREATE POLICY surface_revisions_read_drafts_admin ON public.surface_revisions
  FOR SELECT TO authenticated
  USING (public.has_platform_role('platform_admin'));
DROP POLICY IF EXISTS surface_revisions_write_admin ON public.surface_revisions;
CREATE POLICY surface_revisions_write_admin ON public.surface_revisions
  FOR ALL TO authenticated
  USING (public.has_platform_role('platform_admin'))
  WITH CHECK (public.has_platform_role('platform_admin'));

-- messages: published copy is public (SSR of public pages); drafts admin-only.
DROP POLICY IF EXISTS message_registry_select_published ON public.message_registry;
CREATE POLICY message_registry_select_published ON public.message_registry
  FOR SELECT TO anon, authenticated USING (status = 'published');
DROP POLICY IF EXISTS message_registry_read_drafts_admin ON public.message_registry;
CREATE POLICY message_registry_read_drafts_admin ON public.message_registry
  FOR SELECT TO authenticated
  USING (public.has_platform_role('platform_admin'));
DROP POLICY IF EXISTS message_registry_write_admin ON public.message_registry;
CREATE POLICY message_registry_write_admin ON public.message_registry
  FOR ALL TO authenticated
  USING (public.has_platform_role('platform_admin'))
  WITH CHECK (public.has_platform_role('platform_admin'));

-- operation bindings: authenticated read; admin write.
DROP POLICY IF EXISTS operation_bindings_select ON public.operation_bindings;
CREATE POLICY operation_bindings_select ON public.operation_bindings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS operation_bindings_write_admin ON public.operation_bindings;
CREATE POLICY operation_bindings_write_admin ON public.operation_bindings
  FOR ALL TO authenticated
  USING (public.has_platform_role('platform_admin'))
  WITH CHECK (public.has_platform_role('platform_admin'));

-- settings map: authenticated read; admin write.
DROP POLICY IF EXISTS setting_normative_map_select ON public.setting_normative_map;
CREATE POLICY setting_normative_map_select ON public.setting_normative_map
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS setting_normative_map_write_admin ON public.setting_normative_map;
CREATE POLICY setting_normative_map_write_admin ON public.setting_normative_map
  FOR ALL TO authenticated
  USING (public.has_platform_role('platform_admin'))
  WITH CHECK (public.has_platform_role('platform_admin'));

DROP POLICY IF EXISTS setting_normative_map_terms_select ON public.setting_normative_map_terms;
CREATE POLICY setting_normative_map_terms_select ON public.setting_normative_map_terms
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS setting_normative_map_terms_write ON public.setting_normative_map_terms;
CREATE POLICY setting_normative_map_terms_write ON public.setting_normative_map_terms
  FOR ALL TO authenticated
  USING (public.has_platform_role('platform_admin'))
  WITH CHECK (public.has_platform_role('platform_admin'));

-- ---------------------------------------------------------------------------
-- Grants — same Data API model as the rest of the target: privileges for all
-- API roles with RLS as the sole gate.
-- ---------------------------------------------------------------------------
GRANT ALL ON public.registry_allowlist TO anon, authenticated, service_role;
GRANT ALL ON public.surface_definitions TO anon, authenticated, service_role;
GRANT ALL ON public.surface_revisions TO anon, authenticated, service_role;
GRANT ALL ON public.message_registry TO anon, authenticated, service_role;
GRANT ALL ON public.operation_bindings TO anon, authenticated, service_role;
GRANT ALL ON public.setting_normative_map TO anon, authenticated, service_role;
GRANT ALL ON public.setting_normative_map_terms TO anon, authenticated, service_role;
