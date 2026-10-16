CREATE INDEX CONCURRENTLY public_expert_session_expiry_idx
    ON public_expert_session (expires_at)
    WHERE status = 'active';
