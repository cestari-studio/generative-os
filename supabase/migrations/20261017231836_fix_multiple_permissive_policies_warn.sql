ALTER POLICY "setting_definitions_select_policy" ON public.setting_definitions
  TO anon USING (true);

ALTER POLICY "setting_definitions_write_policy" ON public.setting_definitions
  TO authenticated
  USING (true)
  WITH CHECK (app_private.is_super_admin());

ALTER POLICY "subscriptions_select_policy" ON public.subscriptions
  TO service_role USING (true);

ALTER POLICY "subscriptions_write_policy" ON public.subscriptions
  TO authenticated
  USING (app_private.is_org_member(organization_id) OR app_private.is_super_admin())
  WITH CHECK (app_private.has_org_admin_role(organization_id));

ALTER POLICY "invoices_select_policy" ON public.invoices
  TO service_role USING (true);

ALTER POLICY "invoices_write_policy" ON public.invoices
  TO authenticated
  USING (app_private.is_org_member(organization_id) OR app_private.is_super_admin())
  WITH CHECK (app_private.has_org_admin_role(organization_id));

ALTER POLICY "webhook_endpoints_select_policy" ON public.webhook_endpoints
  TO service_role USING (true);

ALTER POLICY "webhook_endpoints_write_policy" ON public.webhook_endpoints
  TO authenticated
  USING (app_private.is_org_member(organization_id) OR app_private.is_super_admin())
  WITH CHECK (app_private.has_org_admin_role(organization_id));
