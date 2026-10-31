-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Org-context shapes the MERGED resolve_onboarding_readiness needs (integrator
-- supplement to _prereq_onboarding_delegation.sql): persons.active_organization_id,
-- organization_members, and the SECURITY DEFINER membership helper
-- app_private.is_org_member (mirrors the remote helper from 20261017231645 and
-- Worker A's _prereq_readiness_org_scoping.sql). \ir this AFTER
-- _prereq_onboarding_delegation.sql (it expects organizations + auth to exist).

-- organizations (idempotent — the delegation prereq may already have created it)
DROP TABLE IF EXISTS public.organizations CASCADE;
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL UNIQUE,
  name text NOT NULL,
  parent_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  plan_tier text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- persons: carries the server-trusted active_organization_id pointer the RPC reads.
DROP TABLE IF EXISTS public.persons CASCADE;
CREATE TABLE public.persons (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  name text,
  works_for_id uuid,
  active_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  active_workspace_id uuid,
  active_project_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY persons_select_own ON public.persons FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY persons_update_own ON public.persons FOR UPDATE TO authenticated USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
GRANT SELECT, INSERT, UPDATE ON public.persons TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.persons TO service_role;

-- organization_members: membership source of truth for is_org_member.
DROP TABLE IF EXISTS public.organization_members CASCADE;
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  role_name text NOT NULL DEFAULT 'org_member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, member_id)
);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO service_role;

-- SECURITY DEFINER membership helper (InitPlan-safe).
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id AND om.member_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION app_private.is_org_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.is_org_member(uuid) TO authenticated, service_role;
