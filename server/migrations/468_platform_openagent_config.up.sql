CREATE TABLE platform_openagent_config (
    id uuid NOT NULL,
    revision bigint NOT NULL DEFAULT 1,
    base_url text NOT NULL,
    model text NOT NULL,
    api_key_encrypted bytea NOT NULL,
    updated_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    applied_revision bigint,
    apply_status text NOT NULL DEFAULT 'pending',
    apply_error text NOT NULL DEFAULT '',
    applied_at timestamptz,
    last_checked_at timestamptz,
    CONSTRAINT platform_openagent_config_singleton_check
        CHECK (id = '00000000-0000-4000-8000-000000000002'::uuid),
    CONSTRAINT platform_openagent_config_revision_check CHECK (revision > 0),
    CONSTRAINT platform_openagent_config_apply_status_check
        CHECK (apply_status IN ('pending', 'applied', 'failed'))
);
