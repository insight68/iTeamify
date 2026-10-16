-- Third-party MCP definitions remain immutable managed releases while their
-- credential values live in one encrypted seed; workspace-scoped bindings
-- authorize which provisioned tenants may resolve that seed.
-- Relationships are enforced by the provisioning application transaction.
CREATE TABLE managed_mcp_credential_seed (
    mcp_profile_release_id UUID NOT NULL,
    source_workspace_id UUID NOT NULL,
    source_entity_id UUID NOT NULL,
    server_name TEXT NOT NULL CHECK (char_length(server_name) BETWEEN 1 AND 120),
    encrypted_credentials BYTEA NOT NULL CHECK (octet_length(encrypted_credentials) > 0),
    env_keys TEXT[] NOT NULL DEFAULT '{}',
    header_keys TEXT[] NOT NULL DEFAULT '{}',
    CHECK (cardinality(env_keys) + cardinality(header_keys) > 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_managed_mcp_binding (
    workspace_id UUID NOT NULL,
    mcp_profile_release_id UUID NOT NULL,
    provisioning_operation_id UUID NOT NULL,
    managed_state TEXT NOT NULL CHECK (managed_state IN ('staged', 'active', 'retired')),
    managed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
