CREATE INDEX CONCURRENTLY idx_task_usage_updated_at ON public.task_usage USING btree (updated_at);
