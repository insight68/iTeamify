CREATE INDEX CONCURRENTLY idx_contract_submission_review ON public.contract_submission USING btree (workspace_id, review_id, created_at DESC);
