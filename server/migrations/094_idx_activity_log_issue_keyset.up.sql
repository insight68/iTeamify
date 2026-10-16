CREATE INDEX CONCURRENTLY idx_activity_log_issue_keyset ON public.activity_log USING btree (issue_id, created_at DESC, id DESC);
