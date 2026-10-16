CREATE INDEX CONCURRENTLY idx_task_usage_created_at ON public.task_usage USING btree (created_at);
