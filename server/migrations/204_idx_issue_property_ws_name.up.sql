CREATE UNIQUE INDEX CONCURRENTLY idx_issue_property_ws_name ON public.issue_property USING btree (workspace_id, lower(name));
