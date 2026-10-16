CREATE INDEX CONCURRENTLY public_expert_session_page_status_activity_idx
    ON public_expert_session (page_id, status, last_activity_at DESC);
