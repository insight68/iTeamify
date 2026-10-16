CREATE UNIQUE INDEX CONCURRENTLY billing_order_key_idx ON workspace_topup_order (workspace_id, payer_user_id, request_key);
