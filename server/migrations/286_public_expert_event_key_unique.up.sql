CREATE UNIQUE INDEX CONCURRENTLY public_expert_event_key_uidx
    ON public_expert_session_event (event_key);
