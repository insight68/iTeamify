CREATE TABLE mcp_tool_invocation (
    id UUID NOT NULL,
    surface TEXT NOT NULL,
    server_name TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    workspace_id UUID NOT NULL,
    agent_id UUID,
    task_id UUID NOT NULL,
    runtime_id UUID,
    succeeded BOOLEAN NOT NULL,
    duration_ms BIGINT NOT NULL CHECK (duration_ms BETWEEN 0 AND 86400000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
