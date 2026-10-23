-- Copyright IBM Corp. 2026
-- Licensed under the Apache-2.0 license found in the LICENSE file in the root
-- directory of this source tree.
--
-- Fixtures for billing SQL tests (disposable DB only; never seed this into
-- shared environments).
DROP POLICY IF EXISTS om_select_own ON public.organization_members;
CREATE POLICY om_select_own ON public.organization_members FOR SELECT TO authenticated
  USING (member_id = (SELECT auth.uid()) OR public.has_platform_role('platform_admin'));

INSERT INTO public.organizations(id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Org A'),
  ('22222222-2222-2222-2222-222222222222', 'Org B');

INSERT INTO public.persons(id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member.a@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member.b@example.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'billing.admin@example.com');

INSERT INTO public.organization_members(organization_id, member_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

INSERT INTO public.platform_role_assignments(person_id, role_name) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'billing_admin');

INSERT INTO public.products(identifier, name) VALUES ('genos.knowledge', 'genOS Knowledge');

INSERT INTO public.price_books(identifier, version, currency, status)
  VALUES ('brl-2026-10', 1, 'BRL', 'published');

INSERT INTO public.price_components(price_book_id, product_id, pricing_model, unit_label, amount_cents, tiers)
SELECT pb.id, p.id, 'per_unit', 'document', 250, '[]'::jsonb
FROM public.price_books pb, public.products p
WHERE pb.identifier = 'brl-2026-10' AND p.identifier = 'genos.knowledge';

INSERT INTO public.price_components(price_book_id, product_id, pricing_model, unit_label, amount_cents, tiers)
SELECT pb.id, p.id, 'tiered', 'chunk', 0,
  '[{"up_to": 10, "amount_cents": 250}, {"up_to": 50, "amount_cents": 200}, {"up_to": null, "amount_cents": 150}]'::jsonb
FROM public.price_books pb, public.products p
WHERE pb.identifier = 'brl-2026-10' AND p.identifier = 'genos.knowledge';
