CREATE INDEX CONCURRENTLY public_expert_consent_latest_idx
    ON public_expert_consent_record (session_id, purpose, occurred_at DESC, id DESC);
