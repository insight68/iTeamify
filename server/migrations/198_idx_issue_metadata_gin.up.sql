CREATE INDEX CONCURRENTLY idx_issue_metadata_gin ON public.issue USING gin (metadata jsonb_path_ops);
