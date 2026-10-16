CREATE INDEX CONCURRENTLY idx_task_usage_hourly_workspace_agent_time ON public.task_usage_hourly USING btree (workspace_id, agent_id, bucket_hour DESC);
