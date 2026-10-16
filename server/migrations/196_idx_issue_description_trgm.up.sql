CREATE INDEX CONCURRENTLY idx_issue_description_trgm ON public.issue USING gin (lower(COALESCE(description, ''::text)) gin_trgm_ops);
