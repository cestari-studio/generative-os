-- ============================================================================
-- 1. FUNCTIONS & TRIGGERS (Immutable search_path = '')
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_persons_updated_at BEFORE UPDATE ON public.persons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_organization_members_updated_at BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_workspace_members_updated_at BEFORE UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_project_members_updated_at BEFORE UPDATE ON public.project_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_setting_definitions_updated_at BEFORE UPDATE ON public.setting_definitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_scoped_settings_updated_at BEFORE UPDATE ON public.scoped_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_passkey_credentials_updated_at BEFORE UPDATE ON public.passkey_credentials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_knowledge_documents_updated_at BEFORE UPDATE ON public.knowledge_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_media_objects_updated_at BEFORE UPDATE ON public.media_objects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_webhook_endpoints_updated_at BEFORE UPDATE ON public.webhook_endpoints FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Private RLS Membership Helper Functions (in app_private schema)
CREATE OR REPLACE FUNCTION app_private.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'super_admin',
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT app_private.is_super_admin())
    OR EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = p_org_id
        AND om.member_id = (SELECT auth.uid())
    );
$$;

CREATE OR REPLACE FUNCTION app_private.has_org_admin_role(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT app_private.is_super_admin())
    OR EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = p_org_id
        AND om.member_id = (SELECT auth.uid())
        AND om.role_name IN ('super_admin', 'org_owner', 'org_admin')
    );
$$;

CREATE OR REPLACE FUNCTION app_private.has_workspace_write_access(p_org_id uuid, p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT app_private.has_org_admin_role(p_org_id))
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = p_workspace_id
        AND wm.member_id = (SELECT auth.uid())
        AND wm.role_name IN ('workspace_admin', 'workspace_editor')
    );
$$;

REVOKE ALL ON FUNCTION app_private.is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.is_org_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.has_org_admin_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.has_workspace_write_access(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION app_private.is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_org_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.has_org_admin_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.has_workspace_write_access(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_scoped_setting_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_locked_level public.setting_level_type;
BEGIN
  IF NEW.level = 'organization' THEN
    RETURN NEW;
  END IF;

  SELECT s.level INTO v_locked_level
  FROM public.scoped_settings s
  WHERE s.property_id = NEW.property_id
    AND s.organization_id = NEW.organization_id
    AND s.level = 'organization'
    AND s.cascade_rule = 'LOCKED'
  LIMIT 1;

  IF v_locked_level IS NOT NULL THEN
    RAISE EXCEPTION 'Setting "%" is LOCKED at the % level and cannot be overridden at the % level.',
      NEW.property_id, v_locked_level, NEW.level
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.level IN ('project', 'person') AND NEW.workspace_id IS NOT NULL THEN
    SELECT s.level INTO v_locked_level
    FROM public.scoped_settings s
    WHERE s.property_id = NEW.property_id
      AND s.organization_id = NEW.organization_id
      AND s.workspace_id = NEW.workspace_id
      AND s.level = 'workspace'
      AND s.cascade_rule = 'LOCKED'
    LIMIT 1;

    IF v_locked_level IS NOT NULL THEN
      RAISE EXCEPTION 'Setting "%" is LOCKED at the % level and cannot be overridden at the % level.',
        NEW.property_id, v_locked_level, NEW.level
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.level = 'person' AND NEW.project_id IS NOT NULL THEN
    SELECT s.level INTO v_locked_level
    FROM public.scoped_settings s
    WHERE s.property_id = NEW.property_id
      AND s.organization_id = NEW.organization_id
      AND s.project_id = NEW.project_id
      AND s.level = 'project'
      AND s.cascade_rule = 'LOCKED'
    LIMIT 1;

    IF v_locked_level IS NOT NULL THEN
      RAISE EXCEPTION 'Setting "%" is LOCKED at the % level and cannot be overridden at the % level.',
        NEW.property_id, v_locked_level, NEW.level
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_enforce_scoped_setting_lock
  BEFORE INSERT OR UPDATE ON public.scoped_settings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_scoped_setting_lock();

CREATE OR REPLACE FUNCTION public.jsonb_cascade_merge(p_base jsonb, p_override jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_base IS NULL THEN
    RETURN p_override;
  END IF;
  IF p_override IS NULL THEN
    RETURN p_base;
  END IF;

  IF pg_catalog.jsonb_typeof(p_base) = 'object' AND pg_catalog.jsonb_typeof(p_override) = 'object' THEN
    RETURN p_base || p_override;
  ELSIF pg_catalog.jsonb_typeof(p_base) = 'array' AND pg_catalog.jsonb_typeof(p_override) = 'array' THEN
    RETURN (
      SELECT COALESCE(pg_catalog.jsonb_agg( DISTINCT elem ), '[]'::jsonb)
      FROM (
        SELECT pg_catalog.jsonb_array_elements(p_base) AS elem
        UNION ALL
        SELECT pg_catalog.jsonb_array_elements(p_override) AS elem
      ) combined
    );
  ELSE
    RETURN p_override;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_effective_settings(
  p_organization_id uuid,
  p_workspace_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_person_id uuid DEFAULT NULL
)
RETURNS TABLE (
  property_id text,
  scope text,
  name text,
  description text,
  effective_value jsonb,
  source_level text,
  effective_cascade_rule public.cascade_rule_type,
  is_locked boolean,
  locked_by_level text,
  org_value jsonb,
  workspace_value jsonb,
  project_value jsonb,
  person_value jsonb,
  default_value jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH tier_values AS (
    SELECT
      sd.term_code,
      sd.in_defined_term_set AS def_scope,
      sd.name AS def_name,
      sd.description AS def_description,
      sd.default_value AS def_val,
      sd.default_cascade_rule AS def_rule,
      org_s.value AS v_org,
      org_s.cascade_rule AS r_org,
      ws_s.value AS v_ws,
      ws_s.cascade_rule AS r_ws,
      prj_s.value AS v_prj,
      prj_s.cascade_rule AS r_prj,
      per_s.value AS v_per,
      per_s.cascade_rule AS r_per
    FROM public.setting_definitions sd
    LEFT JOIN public.scoped_settings org_s
      ON org_s.property_id = sd.term_code
      AND org_s.organization_id = p_organization_id
      AND org_s.level = 'organization'
    LEFT JOIN public.scoped_settings ws_s
      ON ws_s.property_id = sd.term_code
      AND ws_s.organization_id = p_organization_id
      AND ws_s.workspace_id = p_workspace_id
      AND ws_s.level = 'workspace'
      AND p_workspace_id IS NOT NULL
    LEFT JOIN public.scoped_settings prj_s
      ON prj_s.property_id = sd.term_code
      AND prj_s.organization_id = p_organization_id
      AND prj_s.project_id = p_project_id
      AND prj_s.level = 'project'
      AND p_project_id IS NOT NULL
    LEFT JOIN public.scoped_settings per_s
      ON per_s.property_id = sd.term_code
      AND per_s.organization_id = p_organization_id
      AND per_s.person_id = COALESCE(p_person_id, (SELECT auth.uid()))
      AND per_s.level = 'person'
  )
  SELECT
    tv.term_code AS property_id,
    tv.def_scope AS scope,
    tv.def_name AS name,
    tv.def_description AS description,
    CASE
      WHEN tv.r_org = 'LOCKED' AND tv.v_org IS NOT NULL THEN tv.v_org
      WHEN tv.r_ws = 'LOCKED' AND tv.v_ws IS NOT NULL THEN tv.v_ws
      WHEN tv.r_prj = 'LOCKED' AND tv.v_prj IS NOT NULL THEN tv.v_prj
      WHEN COALESCE(tv.r_org, tv.r_ws, tv.r_prj, tv.def_rule) = 'MERGE' THEN
        public.jsonb_cascade_merge(
          public.jsonb_cascade_merge(
            public.jsonb_cascade_merge(
              public.jsonb_cascade_merge(tv.def_val, tv.v_org),
              tv.v_ws
            ),
            tv.v_prj
          ),
          tv.v_per
        )
      ELSE COALESCE(tv.v_per, tv.v_prj, tv.v_ws, tv.v_org, tv.def_val)
    END AS effective_value,
    CASE
      WHEN tv.r_org = 'LOCKED' AND tv.v_org IS NOT NULL THEN 'organization'
      WHEN tv.r_ws = 'LOCKED' AND tv.v_ws IS NOT NULL THEN 'workspace'
      WHEN tv.r_prj = 'LOCKED' AND tv.v_prj IS NOT NULL THEN 'project'
      WHEN COALESCE(tv.r_org, tv.r_ws, tv.r_prj, tv.def_rule) = 'MERGE'
        AND (tv.v_org IS NOT NULL OR tv.v_ws IS NOT NULL OR tv.v_prj IS NOT NULL OR tv.v_per IS NOT NULL)
        THEN 'merged_cascade'
      WHEN tv.v_per IS NOT NULL THEN 'person'
      WHEN tv.v_prj IS NOT NULL THEN 'project'
      WHEN tv.v_ws IS NOT NULL THEN 'workspace'
      WHEN tv.v_org IS NOT NULL THEN 'organization'
      ELSE 'default'
    END AS source_level,
    COALESCE(tv.r_prj, tv.r_ws, tv.r_org, tv.def_rule) AS effective_cascade_rule,
    (tv.r_org = 'LOCKED' OR tv.r_ws = 'LOCKED' OR tv.r_prj = 'LOCKED') AS is_locked,
    CASE
      WHEN tv.r_org = 'LOCKED' THEN 'organization'
      WHEN tv.r_ws = 'LOCKED' THEN 'workspace'
      WHEN tv.r_prj = 'LOCKED' THEN 'project'
      ELSE NULL
    END AS locked_by_level,
    tv.v_org AS org_value,
    tv.v_ws AS workspace_value,
    tv.v_prj AS project_value,
    tv.v_per AS person_value,
    tv.def_val AS default_value
  FROM tier_values tv
  ORDER BY tv.def_scope, tv.term_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_setting_cascade(
  p_organization_id uuid,
  p_level public.setting_level_type,
  p_property_id text,
  p_value jsonb,
  p_cascade_rule public.cascade_rule_type DEFAULT 'INHERIT_OVERRIDABLE',
  p_workspace_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_person_id uuid DEFAULT NULL,
  p_clear_child_overrides boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_scope text;
  v_name text;
  v_setting_id uuid;
  v_purged_count integer := 0;
  v_caller_id uuid := (SELECT auth.uid());
BEGIN
  SELECT sd.in_defined_term_set, sd.name
  INTO v_scope, v_name
  FROM public.setting_definitions sd
  WHERE sd.term_code = p_property_id;

  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'Unknown setting property_id: %', p_property_id USING ERRCODE = '22023';
  END IF;

  SELECT s.id INTO v_setting_id
  FROM public.scoped_settings s
  WHERE s.property_id = p_property_id
    AND s.level = p_level
    AND s.organization_id = p_organization_id
    AND COALESCE(s.workspace_id, '00000000-0000-0000-0000-000000000000'::uuid) =
        COALESCE(p_workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND COALESCE(s.project_id, '00000000-0000-0000-0000-000000000000'::uuid) =
        COALESCE(p_project_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND COALESCE(s.person_id, '00000000-0000-0000-0000-000000000000'::uuid) =
        COALESCE(p_person_id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF v_setting_id IS NOT NULL THEN
    UPDATE public.scoped_settings
    SET value = p_value,
        cascade_rule = p_cascade_rule,
        updated_by = v_caller_id,
        updated_at = pg_catalog.now()
    WHERE id = v_setting_id;
  ELSE
    INSERT INTO public.scoped_settings (
      property_id,
      scope,
      level,
      organization_id,
      workspace_id,
      project_id,
      person_id,
      name,
      value,
      cascade_rule,
      updated_by
    ) VALUES (
      p_property_id,
      v_scope,
      p_level,
      p_organization_id,
      p_workspace_id,
      p_project_id,
      p_person_id,
      v_name,
      p_value,
      p_cascade_rule,
      v_caller_id
    )
    RETURNING id INTO v_setting_id;
  END IF;

  IF p_clear_child_overrides OR p_cascade_rule = 'LOCKED' THEN
    IF p_level = 'organization' THEN
      DELETE FROM public.scoped_settings
      WHERE organization_id = p_organization_id
        AND property_id = p_property_id
        AND level IN ('workspace', 'project', 'person');
      GET DIAGNOSTICS v_purged_count = ROW_COUNT;
    ELSIF p_level = 'workspace' AND p_workspace_id IS NOT NULL THEN
      DELETE FROM public.scoped_settings
      WHERE organization_id = p_organization_id
        AND workspace_id = p_workspace_id
        AND property_id = p_property_id
        AND level IN ('project', 'person');
      GET DIAGNOSTICS v_purged_count = ROW_COUNT;
    ELSIF p_level = 'project' AND p_project_id IS NOT NULL THEN
      DELETE FROM public.scoped_settings
      WHERE organization_id = p_organization_id
        AND project_id = p_project_id
        AND property_id = p_property_id
        AND level = 'person';
      GET DIAGNOSTICS v_purged_count = ROW_COUNT;
    END IF;
  END IF;

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
    'CascadeAction',
    p_organization_id,
    p_workspace_id,
    p_project_id,
    v_caller_id,
    'CompletedActionStatus',
    'PropertyValue',
    v_setting_id,
    'rpc_cascade',
    pg_catalog.jsonb_build_object(
      '@context', 'https://schema.org',
      '@type', 'CascadeAction',
      'propertyID', p_property_id,
      'level', p_level,
      'value', p_value,
      'cascadeRule', p_cascade_rule,
      'purgedChildOverrides', v_purged_count
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    '@context', 'https://schema.org',
    '@type', 'PropertyValue',
    'id', v_setting_id,
    'propertyID', p_property_id,
    'level', p_level,
    'value', p_value,
    'cascadeRule', p_cascade_rule,
    'purgedChildOverrides', v_purged_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_organization_hierarchy(
  p_name text,
  p_identifier text,
  p_in_language text DEFAULT 'pt-BR',
  p_workspace_name text DEFAULT 'Core Workspace',
  p_project_name text DEFAULT 'Default Project'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_org_id uuid;
  v_ws_id uuid;
  v_prj_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create an organization hierarchy.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.persons (id, name, in_language)
  VALUES (v_user_id, p_name || ' Owner', p_in_language)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizations (
    identifier,
    name,
    alternate_name,
    knows_language,
    status,
    plan_tier
  ) VALUES (
    p_identifier,
    p_name,
    p_name,
    ARRAY[p_in_language, 'en'],
    'active',
    'free'
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (
    organization_id,
    member_id,
    role_name,
    is_default
  ) VALUES (
    v_org_id,
    v_user_id,
    'org_owner',
    true
  );

  INSERT INTO public.workspaces (
    organization_id,
    identifier,
    name,
    environment_type,
    in_language,
    is_default,
    created_by
  ) VALUES (
    v_org_id,
    'core',
    p_workspace_name,
    'production',
    p_in_language,
    true,
    v_user_id
  )
  RETURNING id INTO v_ws_id;

  INSERT INTO public.workspace_members (
    organization_id,
    workspace_id,
    member_id,
    role_name
  ) VALUES (
    v_org_id,
    v_ws_id,
    v_user_id,
    'workspace_admin'
  );

  INSERT INTO public.projects (
    organization_id,
    workspace_id,
    identifier,
    name,
    in_language,
    is_default,
    author_id
  ) VALUES (
    v_org_id,
    v_ws_id,
    'main',
    p_project_name,
    p_in_language,
    true,
    v_user_id
  )
  RETURNING id INTO v_prj_id;

  INSERT INTO public.project_members (
    organization_id,
    workspace_id,
    project_id,
    member_id,
    role_name
  ) VALUES (
    v_org_id,
    v_ws_id,
    v_prj_id,
    v_user_id,
    'project_owner'
  );

  UPDATE public.persons
  SET works_for_id = COALESCE(works_for_id, v_org_id),
      active_organization_id = v_org_id,
      active_workspace_id = v_ws_id,
      active_project_id = v_prj_id
  WHERE id = v_user_id;

  RETURN pg_catalog.jsonb_build_object(
    '@context', 'https://schema.org',
    '@type', 'Organization',
    'organization_id', v_org_id,
    'workspace_id', v_ws_id,
    'project_id', v_prj_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.switch_active_context(
  p_organization_id uuid,
  p_workspace_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_ws_id uuid := p_workspace_id;
  v_prj_id uuid := p_project_id;
BEGIN
  IF NOT (SELECT app_private.is_org_member(p_organization_id)) THEN
    RAISE EXCEPTION 'Access denied to target organization.' USING ERRCODE = '42501';
  END IF;

  IF v_ws_id IS NULL THEN
    SELECT w.id INTO v_ws_id
    FROM public.workspaces w
    WHERE w.organization_id = p_organization_id
    ORDER BY w.is_default DESC, w.created_at ASC
    LIMIT 1;
  END IF;

  IF v_prj_id IS NULL AND v_ws_id IS NOT NULL THEN
    SELECT p.id INTO v_prj_id
    FROM public.projects p
    WHERE p.workspace_id = v_ws_id
    ORDER BY p.is_default DESC, p.created_at ASC
    LIMIT 1;
  END IF;

  UPDATE public.persons
  SET active_organization_id = p_organization_id,
      active_workspace_id = v_ws_id,
      active_project_id = v_prj_id,
      updated_at = pg_catalog.now()
  WHERE id = v_user_id;

  RETURN pg_catalog.jsonb_build_object(
    'active_organization_id', p_organization_id,
    'active_workspace_id', v_ws_id,
    'active_project_id', v_prj_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  p_query_embedding extensions.vector(384),
  p_organization_id uuid,
  p_workspace_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_match_threshold float DEFAULT 0.65,
  p_match_count int DEFAULT 5
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  document_name text,
  visibility_scope public.setting_level_type,
  chunk_text text,
  similarity float
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id AS chunk_id,
    kc.document_id,
    kd.name AS document_name,
    kc.visibility_scope,
    kc.text AS chunk_text,
    (1 - (kc.embedding OPERATOR(extensions.<=>) p_query_embedding))::float AS similarity
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_documents kd ON kd.id = kc.document_id
  WHERE kc.organization_id = p_organization_id
    AND (
      kc.visibility_scope = 'organization'
      OR (kc.visibility_scope = 'workspace' AND kc.workspace_id = p_workspace_id)
      OR (kc.visibility_scope = 'project' AND kc.project_id = p_project_id)
    )
    AND (1 - (kc.embedding OPERATOR(extensions.<=>) p_query_embedding)) >= p_match_threshold
  ORDER BY kc.embedding OPERATOR(extensions.<=>) p_query_embedding ASC
  LIMIT p_match_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.to_schema_org_jsonld(
  p_schema_type text,
  p_record jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    '@context', 'https://schema.org',
    '@type', p_schema_type
  ) || COALESCE(p_record, '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION app_private.sync_person_context_to_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT om.role_name INTO v_role
  FROM public.organization_members om
  WHERE om.organization_id = NEW.active_organization_id
    AND om.member_id = NEW.id
  LIMIT 1;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || pg_catalog.jsonb_build_object(
    'organization_id', NEW.active_organization_id,
    'workspace_id', NEW.active_workspace_id,
    'project_id', NEW.active_project_id,
    'role', COALESCE(v_role, 'org_member'),
    'in_language', NEW.in_language
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.sync_person_context_to_auth() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_sync_person_context_to_auth
  AFTER INSERT OR UPDATE OF active_organization_id, active_workspace_id, active_project_id, in_language
  ON public.persons
  FOR EACH ROW EXECUTE FUNCTION app_private.sync_person_context_to_auth();

CREATE OR REPLACE FUNCTION app_private.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_display_name text;
  v_slug text;
  v_org_id uuid;
  v_ws_id uuid;
  v_prj_id uuid;
BEGIN
  v_display_name := COALESCE(
    NEW.raw_user_meta_data ->> 'name',
    NEW.raw_user_meta_data ->> 'full_name',
    pg_catalog.split_part(COALESCE(NEW.email, 'user'), '@', 1)
  );
  v_slug := pg_catalog.lower(pg_catalog.regexp_replace(v_display_name, '[^a-zA-Z0-9]+', '-', 'g'))
    || '-' || pg_catalog.substr(NEW.id::text, 1, 6);

  INSERT INTO public.persons (
    id,
    identifier,
    name,
    given_name,
    email,
    image,
    in_language
  ) VALUES (
    NEW.id,
    v_slug,
    v_display_name,
    v_display_name,
    NEW.email,
    NEW.raw_user_meta_data ->> 'avatar_url',
    COALESCE(NEW.raw_user_meta_data ->> 'in_language', 'pt-BR')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizations (identifier, name, alternate_name, status, plan_tier)
  VALUES (v_slug || '-org', v_display_name || ' Organization', v_display_name, 'active', 'free')
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, member_id, role_name, is_default)
  VALUES (v_org_id, NEW.id, 'org_owner', true);

  INSERT INTO public.workspaces (organization_id, identifier, name, environment_type, is_default, created_by)
  VALUES (v_org_id, 'core', 'Core Workspace', 'production', true, NEW.id)
  RETURNING id INTO v_ws_id;

  INSERT INTO public.workspace_members (organization_id, workspace_id, member_id, role_name)
  VALUES (v_org_id, v_ws_id, NEW.id, 'workspace_admin');

  INSERT INTO public.projects (organization_id, workspace_id, identifier, name, is_default, author_id)
  VALUES (v_org_id, v_ws_id, 'main', 'Generative OS Project', true, NEW.id)
  RETURNING id INTO v_prj_id;

  INSERT INTO public.project_members (organization_id, workspace_id, project_id, member_id, role_name)
  VALUES (v_org_id, v_ws_id, v_prj_id, NEW.id, 'project_owner');

  UPDATE public.persons
  SET works_for_id = v_org_id,
      active_organization_id = v_org_id,
      active_workspace_id = v_ws_id,
      active_project_id = v_prj_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION app_private.handle_new_auth_user();

CREATE OR REPLACE FUNCTION app_private.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claims jsonb;
  v_user_id uuid;
  v_org_id uuid;
  v_ws_id uuid;
  v_prj_id uuid;
  v_role text;
  v_lang text;
BEGIN
  v_user_id := (event ->> 'user_id')::uuid;
  v_claims := event -> 'claims';

  SELECT
    p.active_organization_id,
    p.active_workspace_id,
    p.active_project_id,
    p.in_language,
    COALESCE(om.role_name, 'org_member')
  INTO v_org_id, v_ws_id, v_prj_id, v_lang, v_role
  FROM public.persons p
  LEFT JOIN public.organization_members om
    ON om.organization_id = p.active_organization_id
    AND om.member_id = p.id
  WHERE p.id = v_user_id;

  IF v_org_id IS NOT NULL THEN
    v_claims := pg_catalog.jsonb_set(
      v_claims,
      '{app_metadata}',
      COALESCE(v_claims -> 'app_metadata', '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'organization_id', v_org_id,
        'workspace_id', v_ws_id,
        'project_id', v_prj_id,
        'role', v_role,
        'in_language', v_lang
      )
    );
  END IF;

  RETURN pg_catalog.jsonb_set(event, '{claims}', v_claims);
END;
$$;

REVOKE ALL ON FUNCTION app_private.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- ============================================================================
-- 2. SECURITY INVOKER VIEWS
-- ============================================================================
CREATE OR REPLACE VIEW public.v_organization_overview
WITH (security_invoker = true)
AS
SELECT
  o.id AS organization_id,
  o.schema_type,
  o.identifier,
  o.name,
  o.legal_name,
  o.alternate_name,
  o.status,
  o.plan_tier,
  o.max_members,
  pg_catalog.count(DISTINCT om.member_id) AS member_count,
  pg_catalog.count(DISTINCT w.id) AS workspace_count,
  pg_catalog.count(DISTINCT p.id) AS project_count,
  o.created_at,
  o.updated_at
FROM public.organizations o
LEFT JOIN public.organization_members om ON om.organization_id = o.id
LEFT JOIN public.workspaces w ON w.organization_id = o.id
LEFT JOIN public.projects p ON p.organization_id = o.id
GROUP BY o.id;

CREATE OR REPLACE VIEW public.v_member_directory
WITH (security_invoker = true)
AS
SELECT
  om.id AS membership_id,
  om.organization_id,
  o.name AS organization_name,
  o.identifier AS organization_identifier,
  om.member_id AS person_id,
  p.name AS person_name,
  p.given_name,
  p.family_name,
  p.email,
  p.image,
  p.job_title,
  p.in_language,
  om.role_name,
  om.is_default,
  om.start_date
FROM public.organization_members om
JOIN public.organizations o ON o.id = om.organization_id
JOIN public.persons p ON p.id = om.member_id;

-- ============================================================================
-- 3. ROW-LEVEL SECURITY (RLS) POLICIES (InitPlan Cached via `(SELECT ...)`)
-- ============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setting_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoped_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_select_policy ON public.organizations FOR SELECT TO authenticated USING ((SELECT app_private.is_org_member(id)));
CREATE POLICY organizations_insert_policy ON public.organizations FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY organizations_update_policy ON public.organizations FOR UPDATE TO authenticated USING ((SELECT app_private.has_org_admin_role(id))) WITH CHECK ((SELECT app_private.has_org_admin_role(id)));
CREATE POLICY organizations_delete_policy ON public.organizations FOR DELETE TO authenticated USING ((SELECT app_private.has_org_admin_role(id)));

CREATE POLICY persons_select_policy ON public.persons FOR SELECT TO authenticated USING (
  id = (SELECT auth.uid())
  OR (works_for_id IS NOT NULL AND (SELECT app_private.is_org_member(works_for_id)))
  OR (active_organization_id IS NOT NULL AND (SELECT app_private.is_org_member(active_organization_id)))
);
CREATE POLICY persons_insert_policy ON public.persons FOR INSERT TO authenticated WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY persons_update_policy ON public.persons FOR UPDATE TO authenticated USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY persons_delete_policy ON public.persons FOR DELETE TO authenticated USING (id = (SELECT auth.uid()) OR (SELECT app_private.is_super_admin()));

CREATE POLICY workspaces_select_policy ON public.workspaces FOR SELECT TO authenticated USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY workspaces_insert_policy ON public.workspaces FOR INSERT TO authenticated WITH CHECK ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY workspaces_update_policy ON public.workspaces FOR UPDATE TO authenticated USING ((SELECT app_private.has_workspace_write_access(organization_id, id))) WITH CHECK ((SELECT app_private.has_workspace_write_access(organization_id, id)));
CREATE POLICY workspaces_delete_policy ON public.workspaces FOR DELETE TO authenticated USING ((SELECT app_private.has_org_admin_role(organization_id)));

CREATE POLICY projects_select_policy ON public.projects FOR SELECT TO authenticated USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY projects_insert_policy ON public.projects FOR INSERT TO authenticated WITH CHECK ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY projects_update_policy ON public.projects FOR UPDATE TO authenticated USING ((SELECT app_private.has_workspace_write_access(organization_id, workspace_id))) WITH CHECK ((SELECT app_private.has_workspace_write_access(organization_id, workspace_id)));
CREATE POLICY projects_delete_policy ON public.projects FOR DELETE TO authenticated USING ((SELECT app_private.has_workspace_write_access(organization_id, workspace_id)));

CREATE POLICY organization_members_select_policy ON public.organization_members FOR SELECT TO authenticated USING (member_id = (SELECT auth.uid()) OR (SELECT app_private.is_org_member(organization_id)));
CREATE POLICY organization_members_insert_policy ON public.organization_members FOR INSERT TO authenticated WITH CHECK (member_id = (SELECT auth.uid()) OR (SELECT app_private.has_org_admin_role(organization_id)));
CREATE POLICY organization_members_update_policy ON public.organization_members FOR UPDATE TO authenticated USING ((SELECT app_private.has_org_admin_role(organization_id))) WITH CHECK ((SELECT app_private.has_org_admin_role(organization_id)));
CREATE POLICY organization_members_delete_policy ON public.organization_members FOR DELETE TO authenticated USING (member_id = (SELECT auth.uid()) OR (SELECT app_private.has_org_admin_role(organization_id)));

CREATE POLICY workspace_members_select_policy ON public.workspace_members FOR SELECT TO authenticated USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY workspace_members_insert_policy ON public.workspace_members FOR INSERT TO authenticated WITH CHECK (member_id = (SELECT auth.uid()) OR (SELECT app_private.has_workspace_write_access(organization_id, workspace_id)));
CREATE POLICY workspace_members_update_policy ON public.workspace_members FOR UPDATE TO authenticated USING ((SELECT app_private.has_workspace_write_access(organization_id, workspace_id))) WITH CHECK ((SELECT app_private.has_workspace_write_access(organization_id, workspace_id)));
CREATE POLICY workspace_members_delete_policy ON public.workspace_members FOR DELETE TO authenticated USING ((SELECT app_private.has_workspace_write_access(organization_id, workspace_id)));

CREATE POLICY project_members_select_policy ON public.project_members FOR SELECT TO authenticated USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY project_members_insert_policy ON public.project_members FOR INSERT TO authenticated WITH CHECK (member_id = (SELECT auth.uid()) OR (SELECT app_private.has_workspace_write_access(organization_id, workspace_id)));
CREATE POLICY project_members_update_policy ON public.project_members FOR UPDATE TO authenticated USING ((SELECT app_private.has_workspace_write_access(organization_id, workspace_id))) WITH CHECK ((SELECT app_private.has_workspace_write_access(organization_id, workspace_id)));
CREATE POLICY project_members_delete_policy ON public.project_members FOR DELETE TO authenticated USING ((SELECT app_private.has_workspace_write_access(organization_id, workspace_id)));

CREATE POLICY setting_definitions_select_policy ON public.setting_definitions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY setting_definitions_write_policy ON public.setting_definitions FOR ALL TO authenticated USING ((SELECT app_private.is_super_admin())) WITH CHECK ((SELECT app_private.is_super_admin()));

CREATE POLICY scoped_settings_select_policy ON public.scoped_settings FOR SELECT TO authenticated USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY scoped_settings_insert_policy ON public.scoped_settings FOR INSERT TO authenticated WITH CHECK (
  (level = 'person' AND person_id = (SELECT auth.uid()) AND (SELECT app_private.is_org_member(organization_id)))
  OR (level IN ('workspace', 'project') AND (SELECT app_private.has_workspace_write_access(organization_id, workspace_id)))
  OR (level = 'organization' AND (SELECT app_private.has_org_admin_role(organization_id)))
);
CREATE POLICY scoped_settings_update_policy ON public.scoped_settings FOR UPDATE TO authenticated USING (
  (level = 'person' AND person_id = (SELECT auth.uid()))
  OR (level IN ('workspace', 'project') AND (SELECT app_private.has_workspace_write_access(organization_id, workspace_id)))
  OR (level = 'organization' AND (SELECT app_private.has_org_admin_role(organization_id)))
) WITH CHECK (
  (level = 'person' AND person_id = (SELECT auth.uid()))
  OR (level IN ('workspace', 'project') AND (SELECT app_private.has_workspace_write_access(organization_id, workspace_id)))
  OR (level = 'organization' AND (SELECT app_private.has_org_admin_role(organization_id)))
);
CREATE POLICY scoped_settings_delete_policy ON public.scoped_settings FOR DELETE TO authenticated USING (
  (level = 'person' AND person_id = (SELECT auth.uid()))
  OR (level IN ('workspace', 'project') AND (SELECT app_private.has_workspace_write_access(organization_id, workspace_id)))
  OR (level = 'organization' AND (SELECT app_private.has_org_admin_role(organization_id)))
);

CREATE POLICY passkey_credentials_select_policy ON public.passkey_credentials FOR SELECT TO authenticated USING (person_id = (SELECT auth.uid()) OR (SELECT app_private.is_super_admin()));
CREATE POLICY passkey_credentials_insert_policy ON public.passkey_credentials FOR INSERT TO authenticated WITH CHECK (person_id = (SELECT auth.uid()));
CREATE POLICY passkey_credentials_update_policy ON public.passkey_credentials FOR UPDATE TO authenticated USING (person_id = (SELECT auth.uid())) WITH CHECK (person_id = (SELECT auth.uid()));
CREATE POLICY passkey_credentials_delete_policy ON public.passkey_credentials FOR DELETE TO authenticated USING (person_id = (SELECT auth.uid()) OR (SELECT app_private.is_super_admin()));

CREATE POLICY webauthn_challenges_select_policy ON public.webauthn_challenges FOR SELECT TO authenticated USING (person_id = (SELECT auth.uid()));
CREATE POLICY webauthn_challenges_insert_policy ON public.webauthn_challenges FOR INSERT TO authenticated WITH CHECK (person_id = (SELECT auth.uid()));
CREATE POLICY webauthn_challenges_delete_policy ON public.webauthn_challenges FOR DELETE TO authenticated USING (person_id = (SELECT auth.uid()));

CREATE POLICY knowledge_documents_select_policy ON public.knowledge_documents FOR SELECT TO authenticated USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY knowledge_documents_insert_policy ON public.knowledge_documents FOR INSERT TO authenticated WITH CHECK ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY knowledge_documents_update_policy ON public.knowledge_documents FOR UPDATE TO authenticated USING ((SELECT app_private.is_org_member(organization_id))) WITH CHECK ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY knowledge_documents_delete_policy ON public.knowledge_documents FOR DELETE TO authenticated USING (author_id = (SELECT auth.uid()) OR (SELECT app_private.has_org_admin_role(organization_id)));

CREATE POLICY knowledge_chunks_select_policy ON public.knowledge_chunks FOR SELECT TO authenticated USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY knowledge_chunks_insert_policy ON public.knowledge_chunks FOR INSERT TO authenticated WITH CHECK ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY knowledge_chunks_delete_policy ON public.knowledge_chunks FOR DELETE TO authenticated USING ((SELECT app_private.is_org_member(organization_id)));

CREATE POLICY media_objects_select_policy ON public.media_objects FOR SELECT TO authenticated USING (is_public OR (SELECT app_private.is_org_member(organization_id)));
CREATE POLICY media_objects_insert_policy ON public.media_objects FOR INSERT TO authenticated WITH CHECK ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY media_objects_update_policy ON public.media_objects FOR UPDATE TO authenticated USING (author_id = (SELECT auth.uid()) OR (SELECT app_private.has_org_admin_role(organization_id))) WITH CHECK (author_id = (SELECT auth.uid()) OR (SELECT app_private.has_org_admin_role(organization_id)));
CREATE POLICY media_objects_delete_policy ON public.media_objects FOR DELETE TO authenticated USING (author_id = (SELECT auth.uid()) OR (SELECT app_private.has_org_admin_role(organization_id)));

CREATE POLICY subscriptions_select_policy ON public.subscriptions FOR SELECT TO authenticated USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY subscriptions_write_policy ON public.subscriptions FOR ALL TO authenticated USING ((SELECT app_private.has_org_admin_role(organization_id))) WITH CHECK ((SELECT app_private.has_org_admin_role(organization_id)));

CREATE POLICY invoices_select_policy ON public.invoices FOR SELECT TO authenticated USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY invoices_write_policy ON public.invoices FOR ALL TO authenticated USING ((SELECT app_private.has_org_admin_role(organization_id))) WITH CHECK ((SELECT app_private.has_org_admin_role(organization_id)));

CREATE POLICY webhook_endpoints_select_policy ON public.webhook_endpoints FOR SELECT TO authenticated USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY webhook_endpoints_write_policy ON public.webhook_endpoints FOR ALL TO authenticated USING ((SELECT app_private.has_org_admin_role(organization_id))) WITH CHECK ((SELECT app_private.has_org_admin_role(organization_id)));

CREATE POLICY audit_actions_select_policy ON public.audit_actions FOR SELECT TO authenticated USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY audit_actions_insert_policy ON public.audit_actions FOR INSERT TO authenticated WITH CHECK ((SELECT app_private.is_org_member(organization_id)));

-- ============================================================================
-- 4. SUPABASE STORAGE BUCKETS & MULTI-TENANT RLS POLICIES
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('organization-branding', 'organization-branding', true, 10485760, ARRAY['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']),
  ('workspace-assets', 'workspace-assets', false, 52428800, ARRAY['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'application/json', 'text/plain', 'text/markdown']),
  ('project-knowledge', 'project-knowledge', false, 52428800, ARRAY['text/markdown', 'text/plain', 'application/pdf', 'application/json', 'text/csv']),
  ('person-avatars', 'person-avatars', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY storage_org_scoped_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('organization-branding', 'person-avatars')
    OR (
      bucket_id IN ('workspace-assets', 'project-knowledge')
      AND (SELECT app_private.is_org_member((storage.foldername(name))[1]::uuid))
    )
  );

CREATE POLICY storage_org_scoped_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    (bucket_id = 'person-avatars' AND (storage.foldername(name))[1] = ((SELECT auth.uid()))::text)
    OR (
      bucket_id IN ('organization-branding', 'workspace-assets', 'project-knowledge')
      AND (SELECT app_private.is_org_member((storage.foldername(name))[1]::uuid))
    )
  );

CREATE POLICY storage_org_scoped_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    (bucket_id = 'person-avatars' AND (storage.foldername(name))[1] = ((SELECT auth.uid()))::text)
    OR (
      bucket_id IN ('organization-branding', 'workspace-assets', 'project-knowledge')
      AND (SELECT app_private.is_org_member((storage.foldername(name))[1]::uuid))
    )
  )
  WITH CHECK (
    (bucket_id = 'person-avatars' AND (storage.foldername(name))[1] = ((SELECT auth.uid()))::text)
    OR (
      bucket_id IN ('organization-branding', 'workspace-assets', 'project-knowledge')
      AND (SELECT app_private.is_org_member((storage.foldername(name))[1]::uuid))
    )
  );

CREATE POLICY storage_org_scoped_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    (bucket_id = 'person-avatars' AND (storage.foldername(name))[1] = ((SELECT auth.uid()))::text)
    OR (
      bucket_id IN ('organization-branding', 'workspace-assets', 'project-knowledge')
      AND (SELECT app_private.has_org_admin_role((storage.foldername(name))[1]::uuid))
    )
  );

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.setting_definitions TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON public.v_organization_overview, public.v_member_directory TO authenticated, service_role;
