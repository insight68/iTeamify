CREATE INDEX CONCURRENTLY reddit_reply_draft_workspace_idx ON public.reddit_reply_draft USING btree (workspace_id, created_at DESC);
