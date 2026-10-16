CREATE UNIQUE INDEX CONCURRENTLY billing_order_session_idx ON workspace_topup_order (stripe_checkout_id) WHERE stripe_checkout_id <> '';
