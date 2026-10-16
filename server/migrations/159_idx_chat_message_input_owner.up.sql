CREATE INDEX CONCURRENTLY idx_chat_message_input_owner ON public.chat_message USING btree (task_id, created_at) WHERE (role = 'user'::text);
