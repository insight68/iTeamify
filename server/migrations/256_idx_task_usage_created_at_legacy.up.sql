CREATE INDEX CONCURRENTLY idx_task_usage_created_at_legacy ON public.task_usage USING btree (created_at) WHERE (updated_at IS NULL);
