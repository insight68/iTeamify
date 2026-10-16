CREATE INDEX CONCURRENTLY public_expert_pending_action_due_idx
    ON public_expert_pending_action (session_id, status, expires_at);
