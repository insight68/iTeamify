-- Revert the managed Claude agents to the read-only tool boundary.
UPDATE agent
SET mcp_config = jsonb_set(
        mcp_config,
        '{mcpServers,iteamify,env,ITEAMIFY_MCP_TOOL_ALLOWLIST}',
        to_jsonb('company_context_get,company_profile_get,lead_get,lead_search,quote_list,resource_action_preview,resource_catalog,resource_describe,resource_get,resource_query,table_get_schema,table_query'::text),
        false
    )
WHERE execution_policy_key = 'workspace_managed_claude_v1'
  AND mcp_config #>> '{mcpServers,iteamify,env,ITEAMIFY_MCP_TOOL_ALLOWLIST}' =
      'company_context_get,company_profile_get,lead_get,lead_search,quote_list,resource_action_preview,resource_catalog,resource_describe,resource_get,resource_query,table_get_schema,table_query,resource_action_execute';
