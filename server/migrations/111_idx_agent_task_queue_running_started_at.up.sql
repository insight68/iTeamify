CREATE INDEX CONCURRENTLY idx_agent_task_queue_running_started_at ON public.agent_task_queue USING btree (started_at) WHERE (status = 'running'::text);
