ALTER TABLE lead_sources
    DROP CONSTRAINT lead_sources_source_type_check,
    ADD CONSTRAINT lead_sources_source_type_check
        CHECK (source_type IN ('lead_mining', 'chat', 'manual', 'quote', 'import', 'api', 'public_expert'));
