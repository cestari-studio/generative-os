-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the
-- root directory of this source tree.
--
-- Prerequisites for the safe-provisioning test (disposable DB only).

\ir _prereq.sql

GRANT USAGE ON SCHEMA auth TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role, anon;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- SECURITY DEFINER membership helper (mirrors app_private.is_org_member): reads
-- auth.uid() in a DEFINER context, avoiding the InitPlan auth.uid() NULL bug that
-- affects bare auth.uid()-in-subquery policies.
CREATE SCHEMA IF NOT EXISTS app_private;
CREATE OR REPLACE FUNCTION app_private.is_org_member(p_org_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = p_org_id AND om.member_id = (SELECT auth.uid()));
$$;

DROP TABLE IF EXISTS public.project_members CASCADE;
DROP TABLE IF EXISTS public.workspace_members CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.workspaces CASCADE;
DROP TABLE IF EXISTS public.organization_members CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;
DROP TABLE IF EXISTS public.persons CASCADE;

CREATE TABLE public.persons (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  works_for_id uuid, active_organization_id uuid, active_workspace_id uuid, active_project_id uuid,
  account_type text, country_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY persons_insert_policy ON public.persons FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY persons_update_policy ON public.persons FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), identifier text NOT NULL UNIQUE, name text NOT NULL,
  legal_name text, tax_id text, country_code text, size_category text, revenue_range text,
  registration_number text, industry_code text, address jsonb, knows_language text[],
  legal_representative_id uuid, status text NOT NULL DEFAULT 'active', plan_tier text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
-- Mirror the InitPlan-bugged insert policy to prove the DEFINER RPC bypasses it.
CREATE POLICY organizations_insert_policy ON public.organizations FOR INSERT TO authenticated WITH CHECK (( SELECT auth.uid() AS uid) IS NOT NULL);

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  role_name text NOT NULL DEFAULT 'org_member', named_position text, is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, member_id)
);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_members_insert_policy ON public.organization_members FOR INSERT TO authenticated WITH CHECK (member_id = auth.uid());
CREATE POLICY organization_members_select_policy ON public.organization_members FOR SELECT TO authenticated USING (true);

CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  identifier text NOT NULL, name text NOT NULL, environment_type text NOT NULL DEFAULT 'production',
  in_language text NOT NULL DEFAULT 'pt-BR', is_default boolean NOT NULL DEFAULT false, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL, workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE, role_name text NOT NULL DEFAULT 'workspace_member',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, member_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL, workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  identifier text NOT NULL, name text NOT NULL, in_language text NOT NULL DEFAULT 'pt-BR',
  is_default boolean NOT NULL DEFAULT false, author_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE, role_name text NOT NULL DEFAULT 'project_member',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, member_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

INSERT INTO auth.users (id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');
INSERT INTO public.persons (id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');

-- Members can read their org (via the DEFINER helper, avoiding the InitPlan bug).
CREATE POLICY organizations_select_policy ON public.organizations FOR SELECT TO authenticated USING (
  (SELECT app_private.is_org_member(id))
);

GRANT SELECT, INSERT, UPDATE ON public.persons TO authenticated;
GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organization_members TO authenticated;
GRANT SELECT ON public.workspaces TO authenticated;
GRANT SELECT ON public.projects TO authenticated;
