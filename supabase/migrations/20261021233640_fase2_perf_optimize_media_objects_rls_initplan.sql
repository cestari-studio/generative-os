-- Optimize media_objects_select_policy to prevent sub-optimal per-row re-evaluation of auth.uid()
ALTER POLICY media_objects_select_policy ON public.media_objects
  TO authenticated, anon
  USING (
    is_public OR (
      ((SELECT auth.uid()) IS NOT NULL) AND (
        app_private.is_org_member(organization_id) OR
        app_private.is_super_admin()
      )
    )
  );
