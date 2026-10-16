-- Backs reverse lookup by decision maker. There is no foreign key from
-- decision_maker_contact_id to lead_contacts (repository rule: relationships
-- are maintained in the application layer), so when a contact is deleted the
-- service has to clear every opportunity pointing at it. That cleanup is a
-- WHERE decision_maker_contact_id = $1 scan, and without this index it would
-- be a sequential scan of every open and closed opportunity in the workspace.
--
-- Single statement in its own file: CREATE INDEX CONCURRENTLY cannot run inside
-- the implicit transaction the migration runner wraps multi-statement files in.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_opportunity_workspace_decision_maker
    ON lead_opportunity (workspace_id, decision_maker_contact_id)
    WHERE decision_maker_contact_id IS NOT NULL;
