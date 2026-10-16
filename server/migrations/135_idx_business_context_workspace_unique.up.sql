CREATE UNIQUE INDEX CONCURRENTLY idx_business_context_workspace_unique ON public.business_context USING btree (workspace_id);
