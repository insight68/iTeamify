CREATE INDEX CONCURRENTLY idx_business_release_workspace_published ON public.business_release USING btree (workspace_id, published_at DESC);
