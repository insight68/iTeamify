CREATE INDEX CONCURRENTLY issue_label_workspace_type_idx ON public.issue_label USING btree (workspace_id, resource_type);
