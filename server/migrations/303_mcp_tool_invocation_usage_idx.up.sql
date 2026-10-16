CREATE INDEX CONCURRENTLY mcp_tool_invocation_usage_idx ON public.mcp_tool_invocation USING btree (created_at, surface, server_name, tool_name, workspace_id);
