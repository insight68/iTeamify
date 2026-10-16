CREATE UNIQUE INDEX CONCURRENTLY token_credit_rate_version_uidx ON public.token_credit_rate USING btree (version);
