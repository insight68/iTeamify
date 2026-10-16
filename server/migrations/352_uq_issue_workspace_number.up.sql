CREATE UNIQUE INDEX CONCURRENTLY uq_issue_workspace_number ON public.issue USING btree (workspace_id, number);
