CREATE INDEX CONCURRENTLY idx_issue_workspace ON public.issue USING btree (workspace_id);
