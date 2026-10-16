CREATE INDEX CONCURRENTLY idx_agent_task_queue_terminal_completed_at ON public.agent_task_queue USING btree (completed_at) WHERE (status = ANY (ARRAY['completed'::text, 'failed'::text]));
