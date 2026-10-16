CREATE INDEX CONCURRENTLY idx_agent_task_queue_queued_created_at ON public.agent_task_queue USING btree (created_at) WHERE (status = 'queued'::text);
