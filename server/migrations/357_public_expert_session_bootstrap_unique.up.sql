CREATE UNIQUE INDEX CONCURRENTLY public_expert_session_bootstrap_uidx
    ON public_expert_session (page_id, initial_client_message_id)
    WHERE initial_client_message_id IS NOT NULL;
