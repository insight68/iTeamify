CREATE UNIQUE INDEX CONCURRENTLY idx_chat_message_sequence ON public.chat_message USING btree (chat_session_id, sequence) WHERE (sequence IS NOT NULL);
