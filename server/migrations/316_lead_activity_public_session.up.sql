CREATE INDEX CONCURRENTLY lead_activity_public_session_idx
    ON lead_activities (workspace_id, public_expert_session_id, occurred_at DESC)
    WHERE public_expert_session_id IS NOT NULL;
