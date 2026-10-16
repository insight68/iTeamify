CREATE UNIQUE INDEX CONCURRENTLY public_expert_reservation_idempotency_uidx
    ON public_expert_usage_reservation (session_id, client_message_id);
