CREATE INDEX CONCURRENTLY idx_business_proposal_workspace_status ON public.business_change_proposal USING btree (workspace_id, status, created_at DESC);
