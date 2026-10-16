CREATE INDEX CONCURRENTLY idx_task_usage_hourly_workspace_time ON public.task_usage_hourly USING btree (workspace_id, bucket_hour DESC);
