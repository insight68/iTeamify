CREATE UNIQUE INDEX CONCURRENTLY billing_ledger_key_idx ON public.workspace_credit_ledger USING btree (workspace_id, business_key);
