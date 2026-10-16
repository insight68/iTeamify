CREATE INDEX CONCURRENTLY idx_issue_title_trgm ON public.issue USING gin (lower(title) gin_trgm_ops);
