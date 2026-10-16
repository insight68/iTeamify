CREATE INDEX CONCURRENTLY idx_project_title_trgm ON public.project USING gin (lower(title) gin_trgm_ops);
