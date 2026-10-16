CREATE UNIQUE INDEX CONCURRENTLY gmail_analysis_binding_connection_workspace_uidx ON public.gmail_analysis_binding USING btree (connection_id, workspace_id);
