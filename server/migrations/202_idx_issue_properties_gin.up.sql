CREATE INDEX CONCURRENTLY idx_issue_properties_gin ON public.issue USING gin (properties jsonb_path_ops);
