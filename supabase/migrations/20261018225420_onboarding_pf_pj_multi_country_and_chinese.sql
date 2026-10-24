-- 1. EXTEND public.organizations (PJ Profile, Size, Country, Tax & Representative)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS legal_representative_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS size_category TEXT NOT NULL DEFAULT 'MICRO'
    CHECK (size_category IN ('MICRO', 'SMALL', 'MEDIUM', 'ENTERPRISE')),
  ADD COLUMN IF NOT EXISTS revenue_range TEXT,
  ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'BR'
    CHECK (country_code IN ('BR', 'US', 'DE', 'GB', 'PT', 'ES', 'FR', 'CN', 'JP')),
  ADD COLUMN IF NOT EXISTS registration_number TEXT,
  ADD COLUMN IF NOT EXISTS state_registration TEXT,
  ADD COLUMN IF NOT EXISTS municipal_registration TEXT,
  ADD COLUMN IF NOT EXISTS industry_code TEXT,
  ADD COLUMN IF NOT EXISTS billing_address JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_organizations_legal_rep ON public.organizations(legal_representative_id);
CREATE INDEX IF NOT EXISTS idx_organizations_country_code ON public.organizations(country_code);
CREATE INDEX IF NOT EXISTS idx_organizations_size_category ON public.organizations(size_category);

-- 2. EXTEND public.persons (PF Profile, Account Type, Country & Tax Identification)
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'individual'
    CHECK (account_type IN ('individual', 'organization_member')),
  ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'BR'
    CHECK (country_code IN ('BR', 'US', 'DE', 'GB', 'PT', 'ES', 'FR', 'CN', 'JP')),
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS national_identity_number TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE;

CREATE INDEX IF NOT EXISTS idx_persons_account_type ON public.persons(account_type);
CREATE INDEX IF NOT EXISTS idx_persons_country_code ON public.persons(country_code);
CREATE INDEX IF NOT EXISTS idx_persons_tax_id ON public.persons(tax_id);

-- 3. LANGUAGE SUPPORT: ADD Chinese (zh-CN)
ALTER TABLE public.organizations
  ALTER COLUMN knows_language SET DEFAULT ARRAY['pt-BR', 'en', 'de', 'jp-JP', 'zh-CN'];

ALTER TABLE public.persons
  ALTER COLUMN knows_language SET DEFAULT ARRAY['pt-BR', 'en', 'de', 'jp-JP', 'zh-CN'];

-- Update existing showcase organization
UPDATE public.organizations
SET knows_language = ARRAY['pt-BR', 'en', 'de', 'jp-JP', 'zh-CN']
WHERE id = '00000000-0000-0000-0000-000000000001';

-- Update setting_definitions for i18n.in_language
UPDATE public.setting_definitions
SET description = 'BCP-47 language tag cascaded from Organization -> Workspace -> Project -> Person (pt-BR, en, de, jp-JP, zh-CN).'
WHERE term_code = 'i18n.in_language';

-- 4. RPC: SAVE ONBOARDING PROGRESS (Atomic, Progressive Persistence)
CREATE OR REPLACE FUNCTION public.save_onboarding_progress(
  p_account_type text,
  p_country_code text,
  p_current_step integer,
  p_step_data jsonb,
  p_is_completed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_person public.persons;
  v_onboarding jsonb;
  v_status text;
  v_new_additional jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_person FROM public.persons WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person profile not found.' USING ERRCODE = 'P0002';
  END IF;

  v_status := CASE WHEN p_is_completed THEN 'completed' ELSE 'in_progress' END;

  v_onboarding := pg_catalog.coalesce(v_person.additional_property -> 'onboarding', '{}'::jsonb);
  v_onboarding := v_onboarding || pg_catalog.jsonb_build_object(
    'account_type', p_account_type,
    'country_code', p_country_code,
    'current_step', p_current_step,
    'status', v_status,
    'last_updated_at', pg_catalog.now(),
    'step_data', pg_catalog.coalesce(v_onboarding -> 'step_data', '{}'::jsonb) || p_step_data
  );

  IF p_is_completed THEN
    v_onboarding := v_onboarding || pg_catalog.jsonb_build_object('completed_at', pg_catalog.now());
  END IF;

  v_new_additional := v_person.additional_property || pg_catalog.jsonb_build_object('onboarding', v_onboarding);

  UPDATE public.persons
  SET account_type = p_account_type,
      country_code = p_country_code,
      additional_property = v_new_additional,
      updated_at = pg_catalog.now()
  WHERE id = v_user_id;

  RETURN v_onboarding;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_onboarding_progress(text, text, integer, jsonb, boolean) TO authenticated;

-- 5. RPC: CREATE / UPDATE ORGANIZATION WITH FULL PJ DETAILS
CREATE OR REPLACE FUNCTION public.create_or_update_corporate_tenant(
  p_name text,
  p_identifier text,
  p_legal_name text,
  p_tax_id text,
  p_country_code text DEFAULT 'BR',
  p_size_category text DEFAULT 'MICRO',
  p_revenue_range text DEFAULT NULL,
  p_registration_number text DEFAULT NULL,
  p_industry_code text DEFAULT NULL,
  p_address jsonb DEFAULT '{}'::jsonb,
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
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  -- 1. Create or update Organization
  INSERT INTO public.organizations (
    identifier,
    name,
    legal_name,
    tax_id,
    country_code,
    size_category,
    revenue_range,
    registration_number,
    industry_code,
    address,
    knows_language,
    legal_representative_id,
    status,
    plan_tier
  ) VALUES (
    p_identifier,
    p_name,
    p_legal_name,
    p_tax_id,
    p_country_code,
    p_size_category,
    p_revenue_range,
    p_registration_number,
    p_industry_code,
    p_address,
    ARRAY[p_in_language, 'en'],
    v_user_id,
    'active',
    'free'
  )
  ON CONFLICT (identifier) DO UPDATE
  SET legal_name = EXCLUDED.legal_name,
      tax_id = EXCLUDED.tax_id,
      country_code = EXCLUDED.country_code,
      size_category = EXCLUDED.size_category,
      revenue_range = EXCLUDED.revenue_range,
      registration_number = EXCLUDED.registration_number,
      industry_code = EXCLUDED.industry_code,
      address = EXCLUDED.address,
      legal_representative_id = EXCLUDED.legal_representative_id,
      updated_at = pg_catalog.now()
  RETURNING id INTO v_org_id;

  -- 2. Register caller as org_owner
  INSERT INTO public.organization_members (
    organization_id,
    member_id,
    role_name,
    named_position,
    is_default
  ) VALUES (
    v_org_id,
    v_user_id,
    'org_owner',
    'Legal Representative',
    true
  )
  ON CONFLICT (organization_id, member_id) DO UPDATE
  SET role_name = 'org_owner',
      is_default = true,
      updated_at = pg_catalog.now();

  -- 3. Provision Default Workspace if not present
  SELECT id INTO v_ws_id FROM public.workspaces WHERE organization_id = v_org_id AND identifier = 'core';
  IF v_ws_id IS NULL THEN
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

    INSERT INTO public.workspace_members (organization_id, workspace_id, member_id, role_name)
    VALUES (v_org_id, v_ws_id, v_user_id, 'workspace_admin')
    ON CONFLICT (workspace_id, member_id) DO NOTHING;
  END IF;

  -- 4. Provision Default Project if not present
  SELECT id INTO v_prj_id FROM public.projects WHERE workspace_id = v_ws_id AND identifier = 'main';
  IF v_prj_id IS NULL THEN
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

    INSERT INTO public.project_members (organization_id, workspace_id, project_id, member_id, role_name)
    VALUES (v_org_id, v_ws_id, v_prj_id, v_user_id, 'project_owner')
    ON CONFLICT (project_id, member_id) DO NOTHING;
  END IF;

  -- 5. Switch person's active context
  UPDATE public.persons
  SET works_for_id = v_org_id,
      active_organization_id = v_org_id,
      active_workspace_id = v_ws_id,
      active_project_id = v_prj_id,
      account_type = 'organization_member',
      country_code = p_country_code,
      updated_at = pg_catalog.now()
  WHERE id = v_user_id;

  RETURN pg_catalog.jsonb_build_object(
    '@context', 'https://schema.org',
    '@type', 'Organization',
    'organization_id', v_org_id,
    'workspace_id', v_ws_id,
    'project_id', v_prj_id,
    'size_category', p_size_category,
    'country_code', p_country_code
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_or_update_corporate_tenant(
  text, text, text, text, text, text, text, text, text, jsonb, text, text, text
) TO authenticated;
