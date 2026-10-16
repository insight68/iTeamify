CREATE UNIQUE INDEX CONCURRENTLY billing_order_session_idx ON public.workspace_topup_order USING btree (stripe_checkout_id) WHERE (stripe_checkout_id <> ''::text);
