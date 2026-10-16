CREATE INDEX CONCURRENTLY lead_source_public_session_idx
    ON lead_sources (workspace_id, public_expert_session_id)
    WHERE public_expert_session_id IS NOT NULL;
