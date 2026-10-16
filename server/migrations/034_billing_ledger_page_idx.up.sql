CREATE INDEX CONCURRENTLY billing_ledger_page_idx ON public.workspace_credit_ledger USING btree (workspace_id, created_at DESC, id DESC);
