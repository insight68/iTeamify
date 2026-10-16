CREATE UNIQUE INDEX CONCURRENTLY idx_session_application_id ON public.session_application USING btree (id);
