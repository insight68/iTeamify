CREATE INDEX CONCURRENTLY idx_agent_task_queue_issue_id ON public.agent_task_queue USING btree (issue_id);
