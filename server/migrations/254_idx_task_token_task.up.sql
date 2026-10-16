CREATE INDEX CONCURRENTLY idx_task_token_task ON public.task_token USING btree (task_id);
