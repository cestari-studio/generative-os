-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Prerequisites for the 3 anon-RPC grant test (disposable DB only).
-- Stub the 3 RPCs with the SAME signatures as live + pre-fix anon grants.

\ir _prereq.sql

GRANT USAGE ON SCHEMA auth TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role, anon;

CREATE OR REPLACE FUNCTION public.save_onboarding_progress(
  p_account_type text, p_country_code text, p_current_step integer, p_step_data jsonb, p_is_completed boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  RETURN pg_catalog.jsonb_build_object('saved', true);
END; $$;

CREATE OR REPLACE FUNCTION public.create_or_update_corporate_tenant(
  p_name text, p_identifier text, p_legal_name text, p_tax_id text, p_country_code text,
  p_size_category text, p_revenue_range text, p_registration_number text, p_industry_code text,
  p_address jsonb, p_in_language text, p_workspace_name text, p_project_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  RETURN pg_catalog.jsonb_build_object('organization_id', gen_random_uuid());
END; $$;

CREATE OR REPLACE FUNCTION public.resolve_effective_settings(
  p_organization_id uuid, p_workspace_id uuid, p_project_id uuid, p_person_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RETURN '[]'::jsonb;
END; $$;

-- provision_corporate_tenant (the authorized successor, same 13-arg signature).
-- Stub body returns a synthetic result; the real takeover-safe body lives in
-- migration 20261026140000 and is covered by the provision suites.
CREATE OR REPLACE FUNCTION public.provision_corporate_tenant(
  p_name text, p_identifier text, p_legal_name text, p_tax_id text, p_country_code text,
  p_size_category text, p_revenue_range text, p_registration_number text, p_industry_code text,
  p_address jsonb, p_in_language text, p_workspace_name text, p_project_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  RETURN pg_catalog.jsonb_build_object('organization_id', gen_random_uuid(), 'provisioned', true);
END; $$;

-- Simulate the LIVE (pre-fix) state: all 3 executable by anon + PUBLIC.
GRANT EXECUTE ON FUNCTION public.save_onboarding_progress(text, text, integer, jsonb, boolean) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_or_update_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_effective_settings(uuid, uuid, uuid, uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provision_corporate_tenant(text, text, text, text, text, text, text, text, text, jsonb, text, text, text) TO authenticated, service_role;
