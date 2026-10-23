REVOKE EXECUTE ON FUNCTION public.create_pagbank_order(uuid, uuid, uuid, bigint, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_tenant_payment_kpis(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_media_object(uuid, uuid, uuid, text, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pagbank_order(uuid, uuid, uuid, bigint, text, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_payment_kpis(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_media_object(uuid, uuid, uuid, text, text, text, text, bigint) TO authenticated, service_role;