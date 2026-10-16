CREATE INDEX CONCURRENTLY idx_issue_workspace_parent ON public.issue USING btree (workspace_id, parent_issue_id);
