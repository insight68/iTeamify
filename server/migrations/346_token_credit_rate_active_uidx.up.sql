CREATE UNIQUE INDEX CONCURRENTLY token_credit_rate_active_uidx ON public.token_credit_rate USING btree (active) WHERE active;
