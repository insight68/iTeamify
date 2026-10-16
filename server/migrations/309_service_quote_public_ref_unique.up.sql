CREATE UNIQUE INDEX CONCURRENTLY service_quote_public_ref_uidx
    ON service_quote (public_ref)
    WHERE public_ref IS NOT NULL;
