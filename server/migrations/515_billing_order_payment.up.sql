CREATE UNIQUE INDEX CONCURRENTLY billing_order_payment_idx ON workspace_topup_order (stripe_payment_id) WHERE stripe_payment_id <> '';
