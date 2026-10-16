CREATE UNIQUE INDEX CONCURRENTLY billing_order_payment_idx ON public.workspace_topup_order USING btree (stripe_payment_id) WHERE (stripe_payment_id <> ''::text);
