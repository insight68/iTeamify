CREATE INDEX CONCURRENTLY idx_issue_origin ON public.issue USING btree (origin_type, origin_id) WHERE (origin_type IS NOT NULL);
