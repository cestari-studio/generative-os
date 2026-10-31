-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Minimal disposable-database setup for the active-context hierarchy test.

\ir _prereq_readiness_org_scoping.sql

INSERT INTO public.organization_members (organization_id, member_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111');

-- The target replaces this existing function in place, preserving its grants.
CREATE FUNCTION public.switch_active_context(uuid, uuid DEFAULT NULL, uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$ SELECT '{}'::jsonb $$;
GRANT EXECUTE ON FUNCTION public.switch_active_context(uuid, uuid, uuid) TO authenticated;
