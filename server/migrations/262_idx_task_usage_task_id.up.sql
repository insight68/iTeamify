CREATE INDEX CONCURRENTLY idx_task_usage_task_id ON public.task_usage USING btree (task_id);
