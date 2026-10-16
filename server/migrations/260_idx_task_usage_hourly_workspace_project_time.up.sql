CREATE INDEX CONCURRENTLY idx_task_usage_hourly_workspace_project_time ON public.task_usage_hourly USING btree (workspace_id, project_id, bucket_hour DESC) WHERE (project_id IS NOT NULL);
