CREATE UNIQUE INDEX CONCURRENTLY assistant_operation_workspace_idempotency_uidx ON public.assistant_operation USING btree (workspace_id, idempotency_key);
