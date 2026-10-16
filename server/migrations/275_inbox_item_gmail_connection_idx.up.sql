CREATE INDEX CONCURRENTLY inbox_item_gmail_connection_idx ON public.inbox_item USING btree (((details ->> 'connection_id'::text))) WHERE (type = 'gmail_analysis'::text);
