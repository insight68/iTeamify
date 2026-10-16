CREATE INDEX CONCURRENTLY idx_issue_project ON public.issue USING btree (project_id);
