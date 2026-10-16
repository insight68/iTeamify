CREATE INDEX CONCURRENTLY idx_lead_contacts_workspace_lead
    ON lead_contacts (workspace_id, lead_id);
