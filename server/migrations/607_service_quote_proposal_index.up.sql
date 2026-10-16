-- Serves the proposal detail page, which lists a proposal's quote versions
-- newest first. Partial because the vast majority of quotes (chat, public
-- expert) have no proposal and should stay out of the index.
CREATE INDEX CONCURRENTLY idx_service_quote_proposal
    ON service_quote (workspace_id, proposal_id, revision DESC)
    WHERE proposal_id IS NOT NULL;
