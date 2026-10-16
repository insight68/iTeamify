CREATE INDEX CONCURRENTLY idx_leads_workspace_inbound_review
    ON leads (workspace_id, updated_at DESC)
    WHERE record_status = 'active'
      AND account_id IS NULL
      AND review_status = 'review'
      AND parked_at IS NULL;
