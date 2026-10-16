CREATE UNIQUE INDEX CONCURRENTLY public_expert_message_session_sequence_uidx
    ON public_expert_message (session_id, sequence);
