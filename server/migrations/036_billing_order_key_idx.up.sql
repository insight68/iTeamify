CREATE UNIQUE INDEX CONCURRENTLY billing_order_key_idx ON public.workspace_topup_order USING btree (workspace_id, payer_user_id, request_key);
