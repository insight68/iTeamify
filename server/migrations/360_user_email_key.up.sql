CREATE UNIQUE INDEX CONCURRENTLY user_email_key ON public."user" USING btree (email);
