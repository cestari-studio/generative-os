CREATE INDEX IF NOT EXISTS idx_connected_seller_accounts_seller_person_id 
  ON public.connected_seller_accounts(seller_person_id);

CREATE INDEX IF NOT EXISTS idx_connected_seller_accounts_workspace_id 
  ON public.connected_seller_accounts(workspace_id);

CREATE INDEX IF NOT EXISTS idx_payment_charges_order_id 
  ON public.payment_charges(order_id);

CREATE INDEX IF NOT EXISTS idx_payment_charges_organization_id 
  ON public.payment_charges(organization_id);

CREATE INDEX IF NOT EXISTS idx_payment_orders_customer_person_id 
  ON public.payment_orders(customer_person_id);

CREATE INDEX IF NOT EXISTS idx_payment_orders_organization_id 
  ON public.payment_orders(organization_id);

CREATE INDEX IF NOT EXISTS idx_payment_orders_project_id 
  ON public.payment_orders(project_id);

CREATE INDEX IF NOT EXISTS idx_payment_orders_workspace_id 
  ON public.payment_orders(workspace_id);

CREATE INDEX IF NOT EXISTS idx_payment_splits_charge_id 
  ON public.payment_splits(charge_id);

CREATE INDEX IF NOT EXISTS idx_payment_splits_connected_seller_id 
  ON public.payment_splits(connected_seller_id);

CREATE INDEX IF NOT EXISTS idx_payment_splits_organization_id 
  ON public.payment_splits(organization_id);

CREATE INDEX IF NOT EXISTS idx_payout_transfers_organization_id 
  ON public.payout_transfers(organization_id);

CREATE INDEX IF NOT EXISTS idx_recurring_plans_organization_id 
  ON public.recurring_plans(organization_id);

CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_customer_person_id 
  ON public.recurring_subscriptions(customer_person_id);

CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_organization_id 
  ON public.recurring_subscriptions(organization_id);

CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_plan_id 
  ON public.recurring_subscriptions(plan_id);
