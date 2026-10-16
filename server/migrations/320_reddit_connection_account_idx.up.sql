CREATE UNIQUE INDEX CONCURRENTLY reddit_connection_account_idx ON public.reddit_connection USING btree (workspace_id, reddit_user_id);
