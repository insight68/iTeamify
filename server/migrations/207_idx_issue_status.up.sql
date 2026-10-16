CREATE INDEX CONCURRENTLY idx_issue_status ON public.issue USING btree (workspace_id, status);
