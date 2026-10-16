CREATE UNIQUE INDEX CONCURRENTLY reddit_budget_client_idx ON public.reddit_request_budget USING btree (client_id);
