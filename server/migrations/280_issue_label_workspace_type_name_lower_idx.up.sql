CREATE UNIQUE INDEX CONCURRENTLY issue_label_workspace_type_name_lower_idx ON public.issue_label USING btree (workspace_id, resource_type, lower(name));
