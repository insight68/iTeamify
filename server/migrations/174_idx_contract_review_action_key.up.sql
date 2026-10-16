CREATE UNIQUE INDEX CONCURRENTLY idx_contract_review_action_key ON public.contract_review_action USING btree (review_id, request_key);
