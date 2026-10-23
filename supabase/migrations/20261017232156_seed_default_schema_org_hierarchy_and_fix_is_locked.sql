-- 1. Ensure is_locked in resolve_effective_settings is never NULL
CREATE OR REPLACE FUNCTION public.resolve_effective_settings(
  p_organization_id uuid,
  p_workspace_id uuid DEFAULT NULL::uuid,
  p_project_id uuid DEFAULT NULL::uuid,
  p_person_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
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
    COALESCE((tv.r_org = 'LOCKED' OR tv.r_ws = 'LOCKED' OR tv.r_prj = 'LOCKED'), false) AS is_locked,
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

-- 2. Seed canonical default Organization, Workspaces, Projects, and Scoped Settings
INSERT INTO public.organizations (id, identifier, name, legal_name, description, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'generative-os-enterprise',
  'Generative OS Enterprise',
  'Generative OS Enterprise Corp.',
  'Primary multi-tenant organization following Schema.org Organization taxonomy.',
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspaces (id, organization_id, identifier, name, description, environment_type, is_default, status)
VALUES
  (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'core-ai-platform',
    'Core AI Platform',
    'Primary workspace for generative AI orchestration, RAG, and governance.',
    'production',
    true,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    'carbon-design-lab',
    'Carbon Design Lab',
    'Design systems workspace for Carbon v11 tokens, themes, and accessibility.',
    'staging',
    false,
    'active'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.projects (id, organization_id, workspace_id, identifier, name, description, is_default, status)
VALUES
  (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'agentic-workflows',
    'Agentic Workflows',
    'Multi-agent orchestration and cascade policy enforcement.',
    true,
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000004',
    'carbon-token-engine',
    'Carbon Token Engine',
    'WCAG 2.2 AA compliant theme and logical CSS properties engine.',
    true,
    'active'
  )
ON CONFLICT (id) DO NOTHING;

-- Seed sample scoped settings via apply_setting_cascade
SELECT public.apply_setting_cascade(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'organization'::public.setting_level_type,
  'auth.session_ttl_minutes',
  '480'::jsonb,
  'LOCKED'::public.cascade_rule_type
);

SELECT public.apply_setting_cascade(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'organization'::public.setting_level_type,
  'ai.system_rules',
  '["Enforce Schema.org JSON-LD entity taxonomy", "Comply with WCAG 2.2 AA accessibility guidelines"]'::jsonb,
  'MERGE'::public.cascade_rule_type
);

SELECT public.apply_setting_cascade(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'workspace'::public.setting_level_type,
  'ai.system_rules',
  '["Prefer pgvector HNSW cosine similarity for knowledge retrieval"]'::jsonb,
  'MERGE'::public.cascade_rule_type,
  '00000000-0000-0000-0000-000000000002'::uuid
);

SELECT public.apply_setting_cascade(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'project'::public.setting_level_type,
  'theme.mode',
  '"g90"'::jsonb,
  'INHERIT_OVERRIDABLE'::public.cascade_rule_type,
  '00000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000003'::uuid
);

-- Update handle_new_auth_user so new users are automatically added to the default organization/workspace/project
CREATE OR REPLACE FUNCTION app_private.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_default_org uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_default_ws uuid := '00000000-0000-0000-0000-000000000002'::uuid;
  v_default_prj uuid := '00000000-0000-0000-0000-000000000003'::uuid;
BEGIN
  INSERT INTO public.persons (
    id, email, name, given_name, family_name, image, in_language,
    works_for_id, active_organization_id, active_workspace_id, active_project_id
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(COALESCE(NEW.email, 'user'), '@', 1)),
    NEW.raw_user_meta_data ->> 'given_name',
    NEW.raw_user_meta_data ->> 'family_name',
    NEW.raw_user_meta_data ->> 'avatar_url',
    COALESCE(NEW.raw_user_meta_data ->> 'in_language', 'en'),
    v_default_org,
    v_default_org,
    v_default_ws,
    v_default_prj
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organization_members (organization_id, member_id, role_name)
  VALUES (v_default_org, NEW.id, 'org_admin')
  ON CONFLICT (organization_id, member_id) DO NOTHING;

  INSERT INTO public.workspace_members (organization_id, workspace_id, member_id, role_name)
  VALUES
    (v_default_org, v_default_ws, NEW.id, 'workspace_admin'),
    (v_default_org, '00000000-0000-0000-0000-000000000004'::uuid, NEW.id, 'workspace_admin')
  ON CONFLICT (workspace_id, member_id) DO NOTHING;

  INSERT INTO public.project_members (organization_id, workspace_id, project_id, member_id, role_name)
  VALUES
    (v_default_org, v_default_ws, v_default_prj, NEW.id, 'project_owner'),
    (v_default_org, '00000000-0000-0000-0000-000000000004'::uuid, '00000000-0000-0000-0000-000000000005'::uuid, NEW.id, 'project_owner')
  ON CONFLICT (project_id, member_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Allow public/anon read on the default showcase organization (00000000-0000-0000-0000-000000000001) so SSR and unauthenticated demo mode work seamlessly
ALTER POLICY "organizations_select_policy" ON public.organizations
  USING (
    id = '00000000-0000-0000-0000-000000000001'::uuid
    OR app_private.is_org_member(id)
    OR app_private.is_super_admin()
  );

ALTER POLICY "workspaces_select_policy" ON public.workspaces
  USING (
    organization_id = '00000000-0000-0000-0000-000000000001'::uuid
    OR app_private.is_org_member(organization_id)
    OR app_private.is_super_admin()
  );

ALTER POLICY "projects_select_policy" ON public.projects
  USING (
    organization_id = '00000000-0000-0000-0000-000000000001'::uuid
    OR app_private.is_org_member(organization_id)
    OR app_private.is_super_admin()
  );

ALTER POLICY "scoped_settings_select_policy" ON public.scoped_settings
  USING (
    organization_id = '00000000-0000-0000-0000-000000000001'::uuid
    OR app_private.is_org_member(organization_id)
    OR app_private.is_super_admin()
  );

ALTER POLICY "knowledge_documents_select_policy" ON public.knowledge_documents
  USING (
    organization_id = '00000000-0000-0000-0000-000000000001'::uuid
    OR app_private.is_org_member(organization_id)
    OR app_private.is_super_admin()
  );

ALTER POLICY "knowledge_chunks_select_policy" ON public.knowledge_chunks
  USING (
    organization_id = '00000000-0000-0000-0000-000000000001'::uuid
    OR app_private.is_org_member(organization_id)
    OR app_private.is_super_admin()
  );
