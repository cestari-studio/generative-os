ALTER POLICY "organizations_select_policy" ON public.organizations
  TO authenticated
  USING (app_private.is_org_member(id) OR app_private.is_super_admin());

ALTER POLICY "workspaces_select_policy" ON public.workspaces
  TO authenticated
  USING (app_private.is_org_member(organization_id) OR app_private.is_super_admin());

ALTER POLICY "projects_select_policy" ON public.projects
  TO authenticated
  USING (app_private.is_org_member(organization_id) OR app_private.is_super_admin());

ALTER POLICY "scoped_settings_select_policy" ON public.scoped_settings
  TO authenticated
  USING (app_private.is_org_member(organization_id) OR app_private.is_super_admin());

ALTER POLICY "knowledge_documents_select_policy" ON public.knowledge_documents
  TO authenticated
  USING (app_private.is_org_member(organization_id) OR app_private.is_super_admin());

ALTER POLICY "knowledge_chunks_select_policy" ON public.knowledge_chunks
  TO authenticated
  USING (app_private.is_org_member(organization_id) OR app_private.is_super_admin());

ALTER POLICY "audit_actions_select_policy" ON public.audit_actions
  TO authenticated
  USING (app_private.is_org_member(organization_id) OR app_private.is_super_admin());

ALTER POLICY "media_objects_select_policy" ON public.media_objects
  TO anon, authenticated
  USING (is_public OR (auth.uid() IS NOT NULL AND (app_private.is_org_member(organization_id) OR app_private.is_super_admin())));
