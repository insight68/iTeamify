CREATE INDEX CONCURRENTLY idx_issue_workspace_assignee ON public.issue USING btree (workspace_id, assignee_type, assignee_id);
