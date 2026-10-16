CREATE UNIQUE INDEX CONCURRENTLY idx_contract_submission_task ON public.contract_submission USING btree (task_id);
