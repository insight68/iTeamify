CREATE UNIQUE INDEX CONCURRENTLY idx_chat_message_client_id ON public.chat_message USING btree (chat_session_id, sender_id, client_message_id) WHERE (client_message_id IS NOT NULL);
