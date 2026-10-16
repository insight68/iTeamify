CREATE UNIQUE INDEX CONCURRENTLY user_password_user_unique ON public.user_password USING btree (user_id);
