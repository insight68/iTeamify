CREATE INDEX CONCURRENTLY idx_contract_review_files ON public.contract_review_file USING btree (workspace_id, review_id, created_at);
