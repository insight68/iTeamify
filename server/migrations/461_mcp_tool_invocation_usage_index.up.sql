CREATE INDEX CONCURRENTLY mcp_tool_invocation_usage_idx ON mcp_tool_invocation (created_at, surface, server_name, tool_name, workspace_id);
