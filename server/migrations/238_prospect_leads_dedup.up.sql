-- Backs the domain-dedup invariant (R5): one lead per normalized domain
-- per workspace. CreateProspectLead relies on this unique index for
-- ON CONFLICT (workspace_id, dedup_key) DO NOTHING semantics, so a
-- re-scrape of the same domain within the same workspace does not create
-- a duplicate lead row (and does not trigger a second LLM extraction
-- call — the cost-control invariant).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_prospect_leads_workspace_dedup
    ON prospect_leads (workspace_id, dedup_key);
