CREATE UNIQUE INDEX CONCURRENTLY public_expert_event_session_sequence_uidx
    ON public_expert_session_event (session_id, sequence);
