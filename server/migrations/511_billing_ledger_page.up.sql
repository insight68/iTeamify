CREATE INDEX CONCURRENTLY billing_ledger_page_idx ON workspace_credit_ledger (workspace_id, created_at DESC, id DESC);
