CREATE TABLE workspace_openagent_config (
 workspace_id UUID NOT NULL,
 revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
 base_url TEXT NOT NULL,
 model TEXT NOT NULL,
 api_key_encrypted BYTEA NOT NULL,
 updated_by UUID NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
