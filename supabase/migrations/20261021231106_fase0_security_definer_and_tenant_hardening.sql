-- 1. Hardened public.apply_setting_cascade
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
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_scope text;
  v_name text;
  v_allowed_levels public.setting_level_type[];
  v_default_rule public.cascade_rule_type;
  v_setting_id uuid;
  v_purged_count integer := 0;
  v_caller_id uuid := (SELECT auth.uid());
BEGIN
  -- 1. Enforce authenticated caller
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: valid session token required to modify settings'
      USING ERRCODE = '28000';
  END IF;

  -- 2. Validate tenant membership and role by target tier level
  IF NOT app_private.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Access denied: caller is not a member of organization %', p_organization_id
      USING ERRCODE = '42501';
  END IF;

  IF p_level = 'organization' THEN
    IF NOT app_private.has_org_admin_role(p_organization_id) THEN
      RAISE EXCEPTION 'Access denied: org_owner or org_admin role required for organization-level settings'
        USING ERRCODE = '42501';
    END IF;
  ELSIF p_level = 'workspace' THEN
    IF p_workspace_id IS NULL THEN
      RAISE EXCEPTION 'workspace_id is required for workspace-level settings'
        USING ERRCODE = '22023';
    END IF;
    -- Verify workspace belongs to organization
    IF NOT EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = p_workspace_id AND w.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'Workspace % does not belong to organization %', p_workspace_id, p_organization_id
        USING ERRCODE = '22023';
    END IF;
    IF NOT app_private.has_workspace_write_access(p_organization_id, p_workspace_id) THEN
      RAISE EXCEPTION 'Access denied: workspace_admin or org_admin required for workspace-level settings'
        USING ERRCODE = '42501';
    END IF;
  ELSIF p_level = 'project' THEN
    IF p_project_id IS NULL THEN
      RAISE EXCEPTION 'project_id is required for project-level settings'
        USING ERRCODE = '22023';
    END IF;
    -- Verify project belongs to organization (and workspace if supplied)
    IF NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = p_project_id
        AND p.organization_id = p_organization_id
        AND (p_workspace_id IS NULL OR p.workspace_id = p_workspace_id)
    ) THEN
      RAISE EXCEPTION 'Project % does not belong to specified organization/workspace', p_project_id
        USING ERRCODE = '22023';
    END IF;
    -- Project write access: org_admin OR project member with owner/editor role
    IF NOT (
      app_private.has_org_admin_role(p_organization_id)
      OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = p_project_id
          AND pm.member_id = v_caller_id
          AND pm.role_name IN ('project_owner', 'project_editor')
      )
    ) THEN
      RAISE EXCEPTION 'Access denied: insufficient privileges for project-level settings'
        USING ERRCODE = '42501';
    END IF;
  ELSIF p_level = 'person' THEN
    IF p_person_id IS NULL THEN
      p_person_id := v_caller_id;
    END IF;
    IF NOT (v_caller_id = p_person_id OR app_private.has_org_admin_role(p_organization_id)) THEN
      RAISE EXCEPTION 'Access denied: callers may only update their own personal settings'
        USING ERRCODE = '42501';
    END IF;
    -- Verify person belongs to the organization
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_organization_id AND om.member_id = p_person_id
    ) THEN
      RAISE EXCEPTION 'Person % is not a member of organization %', p_person_id, p_organization_id
        USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid setting level: %', p_level
      USING ERRCODE = '22023';
  END IF;

  -- 3. Validate setting definition & level eligibility
  SELECT sd.in_defined_term_set, sd.name, sd.allowed_levels, sd.default_cascade_rule
  INTO v_scope, v_name, v_allowed_levels, v_default_rule
  FROM public.setting_definitions sd
  WHERE sd.term_code = p_property_id;

  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'Unknown setting property_id: %', p_property_id
      USING ERRCODE = '22023';
  END IF;

  IF v_allowed_levels IS NOT NULL AND NOT (p_level = ANY(v_allowed_levels)) THEN
    RAISE EXCEPTION 'Setting % is not allowed at level %', p_property_id, p_level
      USING ERRCODE = '22023';
  END IF;

  -- 4. Check if higher tier has locked this setting
  IF p_level IN ('workspace', 'project', 'person') THEN
    IF EXISTS (
      SELECT 1 FROM public.scoped_settings s
      WHERE s.organization_id = p_organization_id
        AND s.property_id = p_property_id
        AND s.level = 'organization'
        AND s.cascade_rule = 'LOCKED'
    ) THEN
      RAISE EXCEPTION 'Setting % is LOCKED at organization level and cannot be overridden', p_property_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_level IN ('project', 'person') AND p_workspace_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.scoped_settings s
      WHERE s.organization_id = p_organization_id
        AND s.workspace_id = p_workspace_id
        AND s.property_id = p_property_id
        AND s.level = 'workspace'
        AND s.cascade_rule = 'LOCKED'
    ) THEN
      RAISE EXCEPTION 'Setting % is LOCKED at workspace level and cannot be overridden', p_property_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 5. Upsert setting at target tier
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

  -- 6. Purge lower-tier overrides only when explicitly authorized and requested or LOCKED
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

  -- 7. Record Schema.org CascadeAction in audit_actions
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
    'value', p_value,
    'level', p_level,
    'cascadeRule', p_cascade_rule,
    'purgedChildOverrides', v_purged_count
  );
END;
$$;

-- 2. Hardened public.record_media_object
CREATE OR REPLACE FUNCTION public.record_media_object(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_bucket_id text,
  p_content_url text,
  p_name text,
  p_encoding_format text,
  p_content_size bigint
)
RETURNS public.media_objects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_media public.media_objects;
  v_caller_id uuid := (SELECT auth.uid());
BEGIN
  -- 1. Enforce authenticated caller
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: valid session token required to record media'
      USING ERRCODE = '28000';
  END IF;

  -- 2. Validate tenant membership
  IF NOT app_private.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Access denied: caller is not an organization member'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validate workspace & project hierarchy if supplied
  IF p_workspace_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = p_workspace_id AND w.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'Workspace % does not belong to organization %', p_workspace_id, p_organization_id
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = p_project_id
        AND p.organization_id = p_organization_id
        AND (p_workspace_id IS NULL OR p.workspace_id = p_workspace_id)
    ) THEN
      RAISE EXCEPTION 'Project % does not belong to specified organization/workspace', p_project_id
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 4. Validate allowed bucket
  IF p_bucket_id NOT IN ('organization-branding', 'person-avatars', 'project-knowledge', 'workspace-assets') THEN
    RAISE EXCEPTION 'Invalid bucket identifier: %', p_bucket_id
      USING ERRCODE = '22023';
  END IF;

  -- 5. Validate content size
  IF p_content_size < 0 THEN
    RAISE EXCEPTION 'Content size must be non-negative'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.media_objects (
    schema_type,
    organization_id,
    workspace_id,
    project_id,
    author_id,
    bucket_id,
    content_url,
    name,
    caption,
    encoding_format,
    content_size,
    is_public
  ) VALUES (
    'MediaObject',
    p_organization_id,
    p_workspace_id,
    p_project_id,
    v_caller_id,
    p_bucket_id,
    p_content_url,
    p_name,
    'Tenant MediaObject (' || p_bucket_id || ')',
    p_encoding_format,
    p_content_size,
    p_bucket_id IN ('organization-branding', 'person-avatars')
  )
  RETURNING * INTO v_media;

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
    'MediaObject',
    v_media.id,
    'storage_upload',
    pg_catalog.jsonb_build_object(
      '@context', 'https://schema.org',
      '@type', 'MediaObject',
      'bucketId', p_bucket_id,
      'name', p_name,
      'encodingFormat', p_encoding_format,
      'contentSize', p_content_size
    )
  );

  RETURN v_media;
END;
$$;

-- 3. Explicitly revoke anonymous EXECUTE on SECURITY DEFINER RPCs
REVOKE EXECUTE ON FUNCTION public.apply_setting_cascade(
  uuid, public.setting_level_type, text, jsonb, public.cascade_rule_type, uuid, uuid, uuid, boolean
) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.record_media_object(
  uuid, uuid, uuid, text, text, text, text, bigint
) FROM PUBLIC, anon;

-- 4. Grant EXECUTE only to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.apply_setting_cascade(
  uuid, public.setting_level_type, text, jsonb, public.cascade_rule_type, uuid, uuid, uuid, boolean
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_media_object(
  uuid, uuid, uuid, text, text, text, text, bigint
) TO authenticated, service_role;
