-- Backs the "parked" lane of the customers page: the only query that filters on
-- parked_at IS NOT NULL, ordered by recency. Partial, so it holds just the
-- shelved rows -- a workspace accumulates active leads forever but keeps only a
-- bounded number parked, so the index stays small no matter how large leads
-- grows. The non-parked lanes are a cheap post-filter on the existing
-- idx_leads_workspace_review and do not need their own index.
--
-- Single statement in its own file: CREATE INDEX CONCURRENTLY cannot run inside
-- the implicit transaction the migration runner wraps multi-statement files in.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_workspace_parked
    ON leads (workspace_id, updated_at DESC)
    WHERE parked_at IS NOT NULL;
