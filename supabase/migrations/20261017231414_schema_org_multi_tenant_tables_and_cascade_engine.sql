-- ============================================================================
-- 1. CORE TABLES (Schema.org Taxonomy)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'Organization'
    CHECK (schema_type IN ('Organization', 'Corporation', 'Consortium', 'NGO', 'EducationalOrganization')),
  identifier TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  legal_name TEXT,
  alternate_name TEXT,
  description TEXT,
  slogan TEXT,
  url TEXT,
  logo TEXT,
  image TEXT,
  email TEXT,
  telephone TEXT,
  tax_id TEXT,
  vat_id TEXT,
  duns TEXT,
  lei_code TEXT,
  naics TEXT,
  iso6523_code TEXT,
  founding_date DATE,
  number_of_employees INTEGER CHECK (number_of_employees IS NULL OR number_of_employees >= 0),
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_point JSONB NOT NULL DEFAULT '{}'::jsonb,
  knows_language TEXT[] NOT NULL DEFAULT ARRAY['pt-BR', 'en', 'de'],
  same_as TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  parent_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  status public.tenant_status NOT NULL DEFAULT 'active',
  trial_ends_at TIMESTAMPTZ,
  plan_tier public.subscription_plan NOT NULL DEFAULT 'free',
  max_members INTEGER NOT NULL DEFAULT 10 CHECK (max_members > 0),
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.organizations IS 'Schema.org Organization representing a top-level multi-tenant organization (tenant).';

CREATE INDEX IF NOT EXISTS idx_organizations_parent_organization_id ON public.organizations(parent_organization_id);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON public.organizations(status);

CREATE TABLE IF NOT EXISTS public.persons (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  schema_type TEXT NOT NULL DEFAULT 'Person' CHECK (schema_type = 'Person'),
  identifier TEXT UNIQUE,
  name TEXT NOT NULL,
  given_name TEXT,
  family_name TEXT,
  additional_name TEXT,
  alternate_name TEXT,
  honorific_prefix TEXT,
  honorific_suffix TEXT,
  job_title TEXT,
  description TEXT,
  email TEXT,
  telephone TEXT,
  image TEXT,
  url TEXT,
  same_as TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  knows_language TEXT[] NOT NULL DEFAULT ARRAY['pt-BR', 'en', 'de'],
  in_language TEXT NOT NULL DEFAULT 'pt-BR',
  nationality TEXT,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  works_for_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  active_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  active_workspace_id UUID,
  active_project_id UUID,
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.persons IS 'Schema.org Person extending auth.users with profile metadata and active multi-tenant context.';

CREATE INDEX IF NOT EXISTS idx_persons_works_for_id ON public.persons(works_for_id);
CREATE INDEX IF NOT EXISTS idx_persons_active_organization_id ON public.persons(active_organization_id);
CREATE INDEX IF NOT EXISTS idx_persons_active_workspace_id ON public.persons(active_workspace_id);
CREATE INDEX IF NOT EXISTS idx_persons_active_project_id ON public.persons(active_project_id);

CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'Department'
    CHECK (schema_type IN ('Department', 'Organization', 'ProgramMembership')),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  name TEXT NOT NULL,
  alternate_name TEXT,
  description TEXT,
  url TEXT,
  logo TEXT,
  environment_type TEXT NOT NULL DEFAULT 'production'
    CHECK (environment_type IN ('production', 'staging', 'development', 'sandbox')),
  in_language TEXT NOT NULL DEFAULT 'pt-BR',
  location JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'suspended')),
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, identifier)
);
COMMENT ON TABLE public.workspaces IS 'Schema.org Department representing an isolated workspace within a tenant organization.';

CREATE INDEX IF NOT EXISTS idx_workspaces_organization_id ON public.workspaces(organization_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_created_by ON public.workspaces(created_by);

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'Project'
    CHECK (schema_type IN ('Project', 'ResearchProject', 'SoftwareApplication', 'CreativeWork')),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  name TEXT NOT NULL,
  alternate_name TEXT,
  description TEXT,
  abstract TEXT,
  url TEXT,
  image TEXT,
  application_category TEXT DEFAULT 'GenerativeAIApplication',
  operating_system TEXT NOT NULL DEFAULT 'Generative OS',
  software_version TEXT NOT NULL DEFAULT '0.1.0',
  in_language TEXT NOT NULL DEFAULT 'pt-BR',
  keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  license TEXT DEFAULT 'https://www.apache.org/licenses/LICENSE-2.0',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'suspended')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  author_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, identifier)
);
COMMENT ON TABLE public.projects IS 'Schema.org Project scoped to a Workspace and Organization.';

CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON public.projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON public.projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_author_id ON public.projects(author_id);

ALTER TABLE public.persons
  ADD CONSTRAINT persons_active_workspace_id_fkey
  FOREIGN KEY (active_workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;

ALTER TABLE public.persons
  ADD CONSTRAINT persons_active_project_id_fkey
  FOREIGN KEY (active_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'OrganizationRole' CHECK (schema_type = 'OrganizationRole'),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL DEFAULT 'org_member'
    CHECK (role_name IN ('super_admin', 'org_owner', 'org_admin', 'org_member', 'org_viewer')),
  named_position TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, member_id)
);
COMMENT ON TABLE public.organization_members IS 'Schema.org OrganizationRole linking a Person to an Organization.';

CREATE INDEX IF NOT EXISTS idx_organization_members_organization_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_member_id ON public.organization_members(member_id);

CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'OrganizationRole' CHECK (schema_type = 'OrganizationRole'),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL DEFAULT 'workspace_editor'
    CHECK (role_name IN ('workspace_admin', 'workspace_editor', 'workspace_viewer')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, member_id)
);
COMMENT ON TABLE public.workspace_members IS 'Schema.org OrganizationRole linking a Person to a Workspace.';

CREATE INDEX IF NOT EXISTS idx_workspace_members_organization_id ON public.workspace_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON public.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_member_id ON public.workspace_members(member_id);

CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'OrganizationRole' CHECK (schema_type = 'OrganizationRole'),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL DEFAULT 'project_editor'
    CHECK (role_name IN ('project_owner', 'project_editor', 'project_viewer')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, member_id)
);
COMMENT ON TABLE public.project_members IS 'Schema.org OrganizationRole linking a Person to a Project.';

CREATE INDEX IF NOT EXISTS idx_project_members_organization_id ON public.project_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_members_workspace_id ON public.project_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_member_id ON public.project_members(member_id);

CREATE TABLE IF NOT EXISTS public.setting_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'DefinedTerm' CHECK (schema_type IN ('DefinedTerm', 'Property')),
  term_code TEXT NOT NULL UNIQUE,
  in_defined_term_set TEXT NOT NULL
    CHECK (in_defined_term_set IN (
      'theme',
      'branding',
      'i18n',
      'a11y',
      'auth_security',
      'ai_rules',
      'feature_flags',
      'quotas',
      'storage_vector'
    )),
  name TEXT NOT NULL,
  description TEXT,
  default_value JSONB NOT NULL,
  value_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_cascade_rule public.cascade_rule_type NOT NULL DEFAULT 'INHERIT_OVERRIDABLE',
  allowed_levels public.setting_level_type[] NOT NULL DEFAULT ARRAY[
    'organization'::public.setting_level_type,
    'workspace'::public.setting_level_type,
    'project'::public.setting_level_type,
    'person'::public.setting_level_type
  ],
  unit_code TEXT,
  unit_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.setting_definitions IS 'Schema.org DefinedTerm catalog defining all valid configuration keys and default cascade rules.';

CREATE TABLE IF NOT EXISTS public.scoped_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'PropertyValue' CHECK (schema_type = 'PropertyValue'),
  property_id TEXT NOT NULL REFERENCES public.setting_definitions(term_code) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  level public.setting_level_type NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  person_id UUID REFERENCES public.persons(id) ON DELETE CASCADE,
  name TEXT,
  value JSONB NOT NULL,
  unit_code TEXT,
  cascade_rule public.cascade_rule_type NOT NULL DEFAULT 'INHERIT_OVERRIDABLE',
  updated_by UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scoped_settings_hierarchy_check CHECK (
    (level = 'organization' AND workspace_id IS NULL AND project_id IS NULL AND person_id IS NULL) OR
    (level = 'workspace' AND workspace_id IS NOT NULL AND project_id IS NULL AND person_id IS NULL) OR
    (level = 'project' AND workspace_id IS NOT NULL AND project_id IS NOT NULL AND person_id IS NULL) OR
    (level = 'person' AND person_id IS NOT NULL)
  )
);
COMMENT ON TABLE public.scoped_settings IS 'Schema.org PropertyValue storing granular settings across Organization, Workspace, Project, and Person tiers.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_scoped_settings_unique_target ON public.scoped_settings (
  property_id,
  level,
  organization_id,
  COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(person_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
CREATE INDEX IF NOT EXISTS idx_scoped_settings_property_id ON public.scoped_settings(property_id);
CREATE INDEX IF NOT EXISTS idx_scoped_settings_organization_id ON public.scoped_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_scoped_settings_workspace_id ON public.scoped_settings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scoped_settings_project_id ON public.scoped_settings(project_id);
CREATE INDEX IF NOT EXISTS idx_scoped_settings_person_id ON public.scoped_settings(person_id);
CREATE INDEX IF NOT EXISTS idx_scoped_settings_updated_by ON public.scoped_settings(updated_by);

CREATE TABLE IF NOT EXISTS public.passkey_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'PublicKeyCredential' CHECK (schema_type = 'PublicKeyCredential'),
  person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  identifier TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Passkey Authenticator',
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  aaguid UUID,
  transports TEXT[] NOT NULL DEFAULT ARRAY['internal', 'hybrid']::TEXT[],
  credential_device_type TEXT NOT NULL DEFAULT 'multiDevice'
    CHECK (credential_device_type IN ('singleDevice', 'multiDevice')),
  credential_backed_up BOOLEAN NOT NULL DEFAULT true,
  attestation_format TEXT DEFAULT 'none',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  revoked BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.passkey_credentials IS 'W3C WebAuthn / Schema.org PublicKeyCredential registered by a Person.';

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_person_id ON public.passkey_credentials(person_id);
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_organization_id ON public.passkey_credentials(organization_id);

CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID REFERENCES public.persons(id) ON DELETE CASCADE,
  email TEXT,
  challenge TEXT NOT NULL UNIQUE,
  ceremony_type TEXT NOT NULL CHECK (ceremony_type IN ('registration', 'authentication')),
  rp_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.webauthn_challenges IS 'Ephemeral challenges for WebAuthn passkey registration and authentication ceremonies.';

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_person_id ON public.webauthn_challenges(person_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires_at ON public.webauthn_challenges(expires_at);

CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'DigitalDocument' CHECK (schema_type IN ('DigitalDocument', 'Article', 'TechArticle', 'Report')),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  encoding_format TEXT NOT NULL DEFAULT 'text/markdown',
  content_url TEXT,
  content_size BIGINT CHECK (content_size IS NULL OR content_size >= 0),
  sha256 TEXT,
  in_language TEXT NOT NULL DEFAULT 'pt-BR',
  keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  visibility_scope public.setting_level_type NOT NULL DEFAULT 'project'
    CHECK (visibility_scope IN ('organization', 'workspace', 'project')),
  indexing_status TEXT NOT NULL DEFAULT 'ready'
    CHECK (indexing_status IN ('pending', 'processing', 'ready', 'failed')),
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.knowledge_documents IS 'Schema.org DigitalDocument for hierarchical RAG vector indexing.';

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_organization_id ON public.knowledge_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_workspace_id ON public.knowledge_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_project_id ON public.knowledge_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_author_id ON public.knowledge_documents(author_id);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'Quotation' CHECK (schema_type IN ('Quotation', 'CreativeWork')),
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  visibility_scope public.setting_level_type NOT NULL DEFAULT 'project'
    CHECK (visibility_scope IN ('organization', 'workspace', 'project')),
  position INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  embedding extensions.vector(384),
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.knowledge_chunks IS 'Schema.org Quotation chunk with 384-d pgvector embedding for hierarchical semantic search.';

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id ON public.knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_organization_id ON public.knowledge_chunks(organization_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_workspace_id ON public.knowledge_chunks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_project_id ON public.knowledge_chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding_hnsw ON public.knowledge_chunks
  USING hnsw (embedding extensions.vector_cosine_ops);

CREATE TABLE IF NOT EXISTS public.media_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'MediaObject'
    CHECK (schema_type IN ('MediaObject', 'ImageObject', 'AudioObject', 'VideoObject', 'DataDownload')),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  bucket_id TEXT NOT NULL,
  content_url TEXT NOT NULL,
  name TEXT NOT NULL,
  alternate_name TEXT NOT NULL DEFAULT '',
  caption TEXT,
  encoding_format TEXT NOT NULL,
  content_size BIGINT NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  sha256 TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.media_objects IS 'Schema.org MediaObject catalog for multi-tenant Supabase Storage assets with accessible alternate_name.';

CREATE INDEX IF NOT EXISTS idx_media_objects_organization_id ON public.media_objects(organization_id);
CREATE INDEX IF NOT EXISTS idx_media_objects_workspace_id ON public.media_objects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_media_objects_project_id ON public.media_objects(project_id);
CREATE INDEX IF NOT EXISTS idx_media_objects_author_id ON public.media_objects(author_id);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'Order' CHECK (schema_type = 'Order'),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  identifier TEXT,
  ordered_item public.subscription_plan NOT NULL DEFAULT 'free',
  order_status public.subscription_status NOT NULL DEFAULT 'active',
  billing_increment public.billing_interval NOT NULL DEFAULT 'month',
  price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  price_currency TEXT NOT NULL DEFAULT 'BRL',
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_through TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 month'),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.subscriptions IS 'Schema.org Order representing an organization subscription plan.';

CREATE INDEX IF NOT EXISTS idx_subscriptions_organization_id ON public.subscriptions(organization_id);

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'Invoice' CHECK (schema_type = 'Invoice'),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  references_order_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  identifier TEXT,
  total_payment_due BIGINT NOT NULL DEFAULT 0,
  price_currency TEXT NOT NULL DEFAULT 'BRL',
  payment_method public.payment_method NOT NULL DEFAULT 'pix',
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  url TEXT,
  payment_status_reason TEXT,
  additional_property JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.invoices IS 'Schema.org Invoice recording billing transactions for an Organization.';

CREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON public.invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_references_order_id ON public.invoices(references_order_id);

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'EntryPoint' CHECK (schema_type = 'EntryPoint'),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url_template TEXT NOT NULL,
  http_method TEXT NOT NULL DEFAULT 'POST',
  encoding_type TEXT NOT NULL DEFAULT 'application/json',
  event_types TEXT[] NOT NULL DEFAULT ARRAY['settings.cascaded']::TEXT[],
  secret_hash TEXT,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_delivered_at TIMESTAMPTZ,
  last_delivery_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.webhook_endpoints IS 'Schema.org EntryPoint for outbound multi-tenant event webhooks.';

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_organization_id ON public.webhook_endpoints(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_workspace_id ON public.webhook_endpoints(workspace_id);

CREATE TABLE IF NOT EXISTS public.audit_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'UpdateAction'
    CHECK (schema_type IN ('CreateAction', 'UpdateAction', 'DeleteAction', 'AuthorizeAction', 'CascadeAction', 'ControlAction')),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  action_status TEXT NOT NULL DEFAULT 'CompletedActionStatus'
    CHECK (action_status IN ('CompletedActionStatus', 'FailedActionStatus', 'ActiveActionStatus')),
  object_type TEXT NOT NULL,
  object_id UUID,
  instrument TEXT NOT NULL DEFAULT 'web_ui',
  previous_value JSONB,
  result JSONB,
  error TEXT,
  location_ip INET,
  user_agent TEXT,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.audit_actions IS 'Schema.org Action immutable audit log for compliance and cascade traceability.';

CREATE INDEX IF NOT EXISTS idx_audit_actions_organization_id ON public.audit_actions(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_actions_workspace_id ON public.audit_actions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_actions_project_id ON public.audit_actions(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_actions_agent_id ON public.audit_actions(agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_actions_start_time ON public.audit_actions(start_time DESC);

INSERT INTO public.setting_definitions (
  term_code,
  in_defined_term_set,
  name,
  description,
  default_value,
  default_cascade_rule,
  unit_code,
  unit_text
) VALUES
  ('theme.mode', 'theme', 'Carbon Theme Mode', 'Controls the Carbon Design System color theme (system, light, dark, white, g10, g90, g100).', '"system"'::jsonb, 'INHERIT_OVERRIDABLE', 'TOKEN', 'theme'),
  ('theme.header_inverse', 'theme', 'Complement Menu Header Theme', 'Applies contrasting dark/light theme between the UIShell header and main content region.', 'true'::jsonb, 'INHERIT_OVERRIDABLE', 'BOOL', 'boolean'),
  ('branding.color_scheme', 'branding', 'Brand Color Tokens', 'Primary and secondary brand colors mapped to --cs-brand and --cs-brand-alt CSS custom properties.', '{"primary": "#0f62fe", "secondary": "#393939"}'::jsonb, 'LOCKED', 'HEX', 'color'),
  ('i18n.in_language', 'i18n', 'Default Interface Language (inLanguage)', 'BCP-47 language tag cascaded from Organization -> Workspace -> Project -> Person (pt-BR, en, de).', '"pt-BR"'::jsonb, 'INHERIT_OVERRIDABLE', 'BCP47', 'locale'),
  ('a11y.reduced_motion', 'a11y', 'Prefer Reduced Motion Override', 'Enforces reduced motion animations for WCAG 2.2 AA accessibility compliance.', 'false'::jsonb, 'INHERIT_OVERRIDABLE', 'BOOL', 'boolean'),
  ('a11y.high_contrast', 'a11y', 'High Contrast Mode', 'Enables high-contrast border and focus indicators across Carbon components.', 'false'::jsonb, 'INHERIT_OVERRIDABLE', 'BOOL', 'boolean'),
  ('auth.require_passkey', 'auth_security', 'Require WebAuthn Passkey (FIDO2)', 'Mandates Passkey authentication for sensitive operations within the organization or workspace.', 'false'::jsonb, 'LOCKED', 'BOOL', 'boolean'),
  ('auth.session_ttl_minutes', 'auth_security', 'Session Time-To-Live (Minutes)', 'Maximum duration of an authenticated session before re-authentication is required.', '1440'::jsonb, 'LOCKED', 'MIN', 'minutes'),
  ('ai.default_model', 'ai_rules', 'Default Generative AI Model', 'Default foundation model identifier for workspace and project agents.', '"gemini-2.5-pro"'::jsonb, 'INHERIT_OVERRIDABLE', 'MODEL', 'identifier'),
  ('ai.system_rules', 'ai_rules', 'Cascading AI Governance & Prompt Rules', 'Array of system rules merged from Organization -> Workspace -> Project -> Person.', '["Follow Schema.org structured output conventions.", "Never expose cross-tenant data or PII."]'::jsonb, 'MERGE', 'RULES', 'array'),
  ('ai.rag_top_k', 'ai_rules', 'Vector RAG Top-K Matches', 'Number of semantic chunks retrieved from pgvector during RAG context assembly.', '5'::jsonb, 'INHERIT_OVERRIDABLE', 'COUNT', 'chunks'),
  ('storage.max_upload_mb', 'storage_vector', 'Max File Upload Size (MB)', 'Maximum size in megabytes for files uploaded to Supabase Storage buckets.', '50'::jsonb, 'LOCKED', 'MB', 'megabytes')
ON CONFLICT (term_code) DO NOTHING;
