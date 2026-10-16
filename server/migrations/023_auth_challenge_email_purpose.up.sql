CREATE INDEX CONCURRENTLY auth_challenge_email_purpose ON public.auth_challenge USING btree (email, purpose, created_at DESC);
