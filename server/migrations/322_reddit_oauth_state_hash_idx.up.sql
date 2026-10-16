CREATE UNIQUE INDEX CONCURRENTLY reddit_oauth_state_hash_idx ON public.reddit_oauth_state USING btree (state_hash);
