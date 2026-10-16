CREATE INDEX CONCURRENTLY idx_issue_first_executed_at ON public.issue USING btree (workspace_id, first_executed_at) WHERE (first_executed_at IS NOT NULL);
