-- ============================================================================
-- 1. EXTENSIONS & PRIVATE SCHEMA (Non-destructive)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role, supabase_auth_admin;

-- ============================================================================
-- 2. NEW ENUMERATIONS FOR CASCADE ENGINE
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cascade_rule_type') THEN
    CREATE TYPE public.cascade_rule_type AS ENUM ('LOCKED', 'INHERIT_OVERRIDABLE', 'MERGE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'setting_level_type') THEN
    CREATE TYPE public.setting_level_type AS ENUM ('organization', 'workspace', 'project', 'person');
  END IF;
END
$$;

-- ============================================================================
-- 3. REMEDIATE LEGACY VIEWS, FUNCTIONS & RLS POLICIES (Zero Advisor Warnings)
-- ============================================================================
ALTER VIEW public.users_with_tenant SET (security_invoker = true);
REVOKE ALL ON TABLE public.users_with_tenant FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.users_with_tenant TO service_role;

ALTER VIEW public.tenant_stats SET (security_invoker = true);
REVOKE ALL ON TABLE public.tenant_stats FROM PUBLIC, anon;

ALTER FUNCTION public.get_current_tenant_id() SET search_path = '';
ALTER FUNCTION public.is_super_admin() SET search_path = '';
ALTER FUNCTION public.get_current_user_role() SET search_path = '';
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.create_tenant(character varying, character varying, uuid) SECURITY INVOKER SET search_path = '';
ALTER FUNCTION public.add_user_to_tenant(uuid, uuid, public.user_role) SECURITY INVOKER SET search_path = '';
REVOKE ALL ON FUNCTION public.create_tenant(character varying, character varying, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_user_to_tenant(uuid, uuid, public.user_role) FROM PUBLIC, anon;

-- Add missing foreign key covering indexes on legacy tables
CREATE INDEX IF NOT EXISTS idx_billing_transactions_subscription_id ON public.billing_transactions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_tenant_settings_updated_by ON public.tenant_settings(updated_by);

-- Optimize all 33 legacy RLS policies with (SELECT auth.jwt()) and (SELECT auth.uid())
ALTER POLICY tenants_delete_policy ON public.tenants USING ((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text));
ALTER POLICY tenants_insert_policy ON public.tenants WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (id)::text)));
ALTER POLICY tenants_select_policy ON public.tenants USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (id)::text)));
ALTER POLICY tenants_update_policy ON public.tenants USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (id)::text))) WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (id)::text)));

ALTER POLICY users_delete_policy ON public.users USING ((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text));
ALTER POLICY users_insert_policy ON public.users WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
ALTER POLICY users_select_policy ON public.users USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
ALTER POLICY users_update_policy ON public.users USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text))) WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));

ALTER POLICY tenant_users_delete_policy ON public.tenant_users USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
ALTER POLICY tenant_users_insert_policy ON public.tenant_users WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
ALTER POLICY tenant_users_select_policy ON public.tenant_users USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
ALTER POLICY tenant_users_update_policy ON public.tenant_users USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text))) WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));

ALTER POLICY passkeys_delete_policy ON public.passkeys USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (user_id = (SELECT auth.uid()))));
ALTER POLICY passkeys_insert_policy ON public.passkeys WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (user_id = (SELECT auth.uid()))));
ALTER POLICY passkeys_select_policy ON public.passkeys USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (user_id = (SELECT auth.uid()))));
ALTER POLICY passkeys_update_policy ON public.passkeys USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (user_id = (SELECT auth.uid())))) WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (user_id = (SELECT auth.uid()))));

ALTER POLICY billing_subscriptions_delete_policy ON public.billing_subscriptions USING ((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text));
ALTER POLICY billing_subscriptions_insert_policy ON public.billing_subscriptions WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
ALTER POLICY billing_subscriptions_select_policy ON public.billing_subscriptions USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
ALTER POLICY billing_subscriptions_update_policy ON public.billing_subscriptions USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text))) WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));

ALTER POLICY billing_transactions_insert_policy ON public.billing_transactions WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
ALTER POLICY billing_transactions_select_policy ON public.billing_transactions USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
ALTER POLICY billing_transactions_update_policy ON public.billing_transactions USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text))) WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));

ALTER POLICY tenant_settings_delete_policy ON public.tenant_settings USING ((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text));
ALTER POLICY tenant_settings_insert_policy ON public.tenant_settings WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
ALTER POLICY tenant_settings_select_policy ON public.tenant_settings USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
ALTER POLICY tenant_settings_update_policy ON public.tenant_settings USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text))) WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));

ALTER POLICY webhooks_delete_policy ON public.webhooks USING ((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text));
ALTER POLICY webhooks_insert_policy ON public.webhooks WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
ALTER POLICY webhooks_select_policy ON public.webhooks USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
ALTER POLICY webhooks_update_policy ON public.webhooks USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text))) WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));

ALTER POLICY audit_logs_insert_policy ON public.audit_logs WITH CHECK (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
ALTER POLICY audit_logs_select_policy ON public.audit_logs USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'super_admin'::text) OR (((SELECT auth.jwt()) ->> 'tenant_id'::text) = (tenant_id)::text)));
