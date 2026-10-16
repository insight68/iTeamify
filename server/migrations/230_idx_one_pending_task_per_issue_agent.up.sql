CREATE UNIQUE INDEX CONCURRENTLY idx_one_pending_task_per_issue_agent ON public.agent_task_queue USING btree (issue_id, agent_id) WHERE (status = ANY (ARRAY['queued'::text, 'dispatched'::text]));
