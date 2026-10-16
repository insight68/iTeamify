CREATE UNIQUE INDEX CONCURRENTLY billing_account_idx ON public.workspace_credit_account USING btree (workspace_id);
