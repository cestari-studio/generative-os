-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Prerequisites for the create_organization_hierarchy SECURITY DEFINER test
-- (disposable DB only). Provides the auth schema/roles and the FULL shapes of
-- the 7 tables the RPC writes to, mirroring the remote schema (20261017231414
-- + later), WITHOUT applying the full migration chain.

\ir _prereq.sql

GRANT USAGE ON SCHEMA auth TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role, anon;

-- Recreate the base tables with the full shapes the RPC references (the shared
-- _prereq.sql only provides minimal shapes). DROP + recreate for accuracy.
DROP TABLE IF EXISTS public.project_members CASCADE;
DROP TABLE IF EXISTS public.workspace_members CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.workspaces CASCADE;
DROP TABLE IF EXISTS public.organization_members CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;
DROP TABLE IF EXISTS public.persons CASCADE;

CREATE TABLE public.persons (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  schema_type text NOT NULL DEFAULT 'Person',
  name text NOT NULL,
  in_language text NOT NULL DEFAULT 'pt-BR',
  works_for_id uuid,
  active_organization_id uuid,
  active_workspace_id uuid,
  active_project_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY persons_insert_policy ON public.persons FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type text NOT NULL DEFAULT 'Organization',
  identifier text NOT NULL UNIQUE,
  name text NOT NULL,
  alternate_name text,
  knows_language text[],
  status text NOT NULL DEFAULT 'active',
  plan_tier text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
-- Mirror the REAL (broken) policy to prove the DEFINER RPC bypasses it.
CREATE POLICY organizations_insert_policy ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (( SELECT auth.uid() AS uid) IS NOT NULL);

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  role_name text NOT NULL DEFAULT 'org_member',
  is_default boolean NOT NULL DEFAULT false,
  start_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, member_id)
);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  identifier text NOT NULL,
  name text NOT NULL,
  environment_type text NOT NULL DEFAULT 'production',
  in_language text NOT NULL DEFAULT 'pt-BR',
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, identifier)
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  role_name text NOT NULL DEFAULT 'workspace_member',
  start_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, member_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  identifier text NOT NULL,
  name text NOT NULL,
  in_language text NOT NULL DEFAULT 'pt-BR',
  is_default boolean NOT NULL DEFAULT false,
  author_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, identifier)
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  role_name text NOT NULL DEFAULT 'project_member',
  start_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, member_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Real users for the test callers.
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

-- Members never write directly; only the RPC (as DEFINER/owner) may. Authenticated
-- gets table-level privileges so the INVOKER-baseline comparison in the test can
-- demonstrate the RLS block, but the DEFINER path bypasses RLS as the owner.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.persons TO authenticated;
GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organization_members TO authenticated;
GRANT SELECT ON public.workspaces TO authenticated;
GRANT SELECT ON public.projects TO authenticated;
