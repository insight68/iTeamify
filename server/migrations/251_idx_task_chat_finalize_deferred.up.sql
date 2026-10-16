CREATE INDEX CONCURRENTLY idx_task_chat_finalize_deferred ON public.agent_task_queue USING btree (chat_finalize_deferred_at) WHERE (chat_finalize_deferred_at IS NOT NULL);
