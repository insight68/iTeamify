CREATE INDEX CONCURRENTLY idx_autopilot_run_issue ON public.autopilot_run USING btree (issue_id) WHERE (issue_id IS NOT NULL);
