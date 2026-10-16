CREATE INDEX CONCURRENTLY public_expert_session_retention_candidate_idx
    ON public_expert_session (expires_at, id)
    WHERE status IN ('expired', 'completed', 'closed', 'blocked');
