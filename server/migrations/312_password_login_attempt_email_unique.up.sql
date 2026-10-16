CREATE UNIQUE INDEX CONCURRENTLY password_login_attempt_email_unique ON public.password_login_attempt USING btree (email);
