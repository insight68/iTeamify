-- The lead detail page lists proposals through the lead, not the opportunity,
-- because a lead can carry several deals and the timeline wants all of them.
CREATE INDEX CONCURRENTLY idx_service_proposal_lead
    ON service_proposal (workspace_id, lead_id, updated_at DESC);
