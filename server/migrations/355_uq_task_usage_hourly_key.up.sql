CREATE UNIQUE INDEX CONCURRENTLY uq_task_usage_hourly_key ON public.task_usage_hourly USING btree (bucket_hour, workspace_id, runtime_id, agent_id, project_id, provider, model) NULLS NOT DISTINCT;
