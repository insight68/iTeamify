CREATE UNIQUE INDEX CONCURRENTLY public_expert_message_client_uidx
    ON public_expert_message (session_id, client_message_id)
    WHERE client_message_id IS NOT NULL;
