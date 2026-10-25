-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Supabase-compatible prerequisites for workspace-management SQL tests
-- (disposable DB only). Mirrors the shapes the workspace_create migration
-- references, from 20261017231414 and 20261017231645, without applying the
-- full migrations (which require the complete chain).

\ir _prereq.sql

-- Mirror the Supabase platform grants the `authenticated` role relies on:
-- USAGE on the auth schema and EXECUTE on auth.uid(). SECURITY INVOKER
-- functions (like create_workspace) run with the caller's privileges, so
-- without these grants the auth.uid() call inside the body fails with
-- "permission denied for schema auth".
GRANT USAGE ON SCHEMA auth TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role, anon;

-- Full workspaces shape (mirrors 20261017231414).
DROP TABLE IF EXISTS public.workspaces CASCADE;
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type text NOT NULL DEFAULT 'Department',
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  identifier text NOT NULL,
  name text NOT NULL,
  alternate_name text,
  description text,
  url text,
  logo text,
  environment_type text NOT NULL DEFAULT 'production',
  in_language text NOT NULL DEFAULT 'pt-BR',
  location jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, identifier)
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Full organization_members shape (mirrors 20261017231414).
DROP TABLE IF EXISTS public.organization_members CASCADE;
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  role_name text NOT NULL DEFAULT 'org_member',
  named_position text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, member_id)
);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- app_private helpers (mirror 20261017231645, minimal for this contract).
CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT false
$$;

CREATE OR REPLACE FUNCTION app_private.is_org_member(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id AND om.member_id = (SELECT auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION app_private.has_org_admin_role(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    (SELECT app_private.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_org_id
        AND om.member_id = (SELECT auth.uid())
        AND om.role_name IN ('super_admin', 'org_owner', 'org_admin')
    )
$$;

CREATE OR REPLACE FUNCTION app_private.has_workspace_write_access(p_org_id uuid, p_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT app_private.has_org_admin_role(p_org_id))
$$;

-- Grants must come AFTER the schema/functions exist (mirrors 20261017231258
-- and 20261017231645): INVOKER functions like create_workspace call these
-- helpers with the caller's privileges.
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_org_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.has_org_admin_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.has_workspace_write_access(uuid, uuid) TO authenticated, service_role;

-- Table grants + RLS policies for the tables this contract touches
-- (mirrors 20261017231645 exposure model).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.persons TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated, service_role;

CREATE POLICY workspaces_select_policy ON public.workspaces FOR SELECT TO authenticated
  USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY workspaces_insert_policy ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY workspaces_update_policy ON public.workspaces FOR UPDATE TO authenticated
  USING ((SELECT app_private.has_workspace_write_access(organization_id, id)))
  WITH CHECK ((SELECT app_private.has_workspace_write_access(organization_id, id)));

CREATE POLICY organizations_select_policy ON public.organizations FOR SELECT TO authenticated
  USING ((SELECT app_private.is_org_member(id)));
CREATE POLICY organization_members_select_policy ON public.organization_members FOR SELECT TO authenticated
  USING ((SELECT app_private.is_org_member(organization_id)));
CREATE POLICY persons_select_policy ON public.persons FOR SELECT TO authenticated
  USING (true);

-- Full organizations/persons shapes needed by the fixtures (add missing cols).
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS schema_type text NOT NULL DEFAULT 'Organization';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS identifier text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS schema_type text NOT NULL DEFAULT 'Person';
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Test fixtures: two orgs, one admin each in their own org.
INSERT INTO public.organizations (id, schema_type, identifier, name, status)
VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'Organization', 'org-alpha-ws', 'Org Alpha WS', 'active'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'Organization', 'org-beta-ws', 'Org Beta WS', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.persons (id, schema_type, name, email, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Person', 'Alpha Admin', 'alpha.admin@example.test', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Person', 'Beta Member', 'beta.member@example.test', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organization_members (organization_id, member_id, role_name)
VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'org_admin'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'org_member')
ON CONFLICT DO NOTHING;
