CREATE INDEX CONCURRENTLY idx_chat_message_latest ON public.chat_message USING btree (chat_session_id, created_at DESC, id DESC);
