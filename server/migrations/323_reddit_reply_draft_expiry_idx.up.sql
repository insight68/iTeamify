CREATE INDEX CONCURRENTLY reddit_reply_draft_expiry_idx ON public.reddit_reply_draft USING btree (expires_at);
