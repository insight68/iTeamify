CREATE INDEX CONCURRENTLY gmail_analysis_binding_workspace_enabled_idx ON public.gmail_analysis_binding USING btree (workspace_id, enabled);
