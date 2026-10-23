-- ============================================================================
-- genOS / Cestari Studio — Notifications foundation (persistence + read state)
-- ============================================================================
-- Additive-only migration: the minimal honest foundation for the normative
-- capability.integration_notification entities (NotificationIntent,
-- DeliveryAttempt). This delivers org-scoped notification persistence with
-- read state and tenant isolation. The dispatch/channel/template machinery
-- (notification-dispatch, preferences, providers) is intentionally OUT of
-- scope until provider integrations exist — no fake dispatch.
--
-- STATUS: pending schema reconciliation before apply. Validated on
-- disposable PostgreSQL 17.11 with RLS enforced as the authenticated role.
-- NOT applied to any remote yet.
--
-- Conventions: RLS as the primary boundary; client writes go through the
-- mark_notification_read RPC only (direct INSERT/UPDATE/DELETE on the table
-- is denied for `authenticated`); SECURITY INVOKER with auth.uid() checks.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. notifications table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_type TEXT NOT NULL DEFAULT 'Message' CHECK (schema_type IN ('Message', 'Report')),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_person_id UUID REFERENCES public.persons(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.notifications IS 'Org-scoped notification records with read state. Writes happen server-side only (dispatch path out of scope); clients read and mark-read via the mark_notification_read RPC.';

CREATE INDEX IF NOT EXISTS idx_notifications_organization_id ON public.notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_person_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Row Level Security — the primary tenant boundary
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Members read their org's notifications (optionally narrowed to recipient).
CREATE POLICY notifications_select_policy ON public.notifications
  FOR SELECT TO authenticated
  USING ((SELECT app_private.is_org_member(organization_id)));

-- Members may update ONLY the read_at marker on their org's notifications
-- (the mark-read path). The RPC additionally enforces membership in its body.
CREATE POLICY notifications_update_read_policy ON public.notifications
  FOR UPDATE TO authenticated
  USING ((SELECT app_private.is_org_member(organization_id)))
  WITH CHECK ((SELECT app_private.is_org_member(organization_id)));

-- INSERT and DELETE have NO authenticated policy, so RLS denies them by
-- default — notification creation stays server-side (service_role).

-- ---------------------------------------------------------------------------
-- 3. mark_notification_read RPC (SECURITY INVOKER, caller-scoped)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_notification public.notifications;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege: authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_notification FROM public.notifications WHERE id = p_notification_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found: notification does not exist' USING ERRCODE = 'P0002';
  END IF;

  -- Tenant boundary: only an org member may mark the org's notification read.
  IF NOT (SELECT app_private.is_org_member(v_notification.organization_id)) THEN
    RAISE EXCEPTION 'insufficient_privilege: not an organization member' USING ERRCODE = '42501';
  END IF;

  UPDATE public.notifications
  SET read_at = pg_catalog.now()
  WHERE id = p_notification_id;

  RETURN jsonb_build_object('id', p_notification_id, 'read_at', pg_catalog.now());
END;
$$;

COMMENT ON FUNCTION public.mark_notification_read(uuid) IS
  'Marks a notification read. Caller must be a member of the notification''s organization; SECURITY INVOKER so RLS also applies to the UPDATE.';

GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Table-level grants (Data API exposure per RLS above)
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO service_role;
