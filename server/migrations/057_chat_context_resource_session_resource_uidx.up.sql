CREATE UNIQUE INDEX CONCURRENTLY chat_context_resource_session_resource_uidx ON public.chat_context_resource USING btree (chat_session_id, resource_type, resource_id);
