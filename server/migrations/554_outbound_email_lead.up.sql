CREATE INDEX CONCURRENTLY outbound_email_lead_idx ON outbound_email (workspace_id, user_id, lead_id, created_at DESC) WHERE lead_id IS NOT NULL;
