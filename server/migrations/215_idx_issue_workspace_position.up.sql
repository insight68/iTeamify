CREATE INDEX CONCURRENTLY idx_issue_workspace_position ON public.issue USING btree (workspace_id, "position", created_at DESC, id DESC);
