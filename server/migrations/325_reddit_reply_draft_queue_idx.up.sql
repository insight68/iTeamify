CREATE INDEX CONCURRENTLY reddit_reply_draft_queue_idx ON public.reddit_reply_draft USING btree (available_at) WHERE (status = 'queued'::text);
