CREATE INDEX CONCURRENTLY idx_agent_task_queue_agent ON public.agent_task_queue USING btree (agent_id, status);
