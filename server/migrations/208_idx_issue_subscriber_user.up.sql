CREATE INDEX CONCURRENTLY idx_issue_subscriber_user ON public.issue_subscriber USING btree (user_type, user_id);
