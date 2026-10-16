CREATE INDEX CONCURRENTLY idx_issue_property_workspace ON public.issue_property USING btree (workspace_id);
