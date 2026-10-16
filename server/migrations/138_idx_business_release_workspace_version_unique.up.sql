CREATE UNIQUE INDEX CONCURRENTLY idx_business_release_workspace_version_unique ON public.business_release USING btree (workspace_id, version);
