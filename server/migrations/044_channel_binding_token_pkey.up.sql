CREATE UNIQUE INDEX CONCURRENTLY channel_binding_token_pkey ON public.channel_binding_token USING btree (token_hash);
