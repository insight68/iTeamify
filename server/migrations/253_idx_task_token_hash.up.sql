CREATE UNIQUE INDEX CONCURRENTLY idx_task_token_hash ON public.task_token USING btree (token_hash);
