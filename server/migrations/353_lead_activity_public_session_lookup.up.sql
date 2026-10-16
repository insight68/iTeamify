CREATE INDEX CONCURRENTLY lead_activity_public_session_lookup_idx
    ON lead_activities (public_expert_session_id)
    WHERE public_expert_session_id IS NOT NULL;
