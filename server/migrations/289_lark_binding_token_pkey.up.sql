CREATE UNIQUE INDEX CONCURRENTLY lark_binding_token_pkey ON public.lark_binding_token USING btree (token_hash);
