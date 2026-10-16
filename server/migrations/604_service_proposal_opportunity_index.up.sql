-- Serves "which proposals does this deal have, and which is live". status is
-- part of the key because callers filter to a single proposal status at a time
-- (the current one) rather than sorting across all of them.
CREATE INDEX CONCURRENTLY idx_service_proposal_opportunity
    ON service_proposal (workspace_id, opportunity_id, status);
