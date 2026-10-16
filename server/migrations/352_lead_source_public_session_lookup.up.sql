CREATE INDEX CONCURRENTLY lead_source_public_session_lookup_idx
    ON lead_sources (public_expert_session_id)
    WHERE public_expert_session_id IS NOT NULL;
