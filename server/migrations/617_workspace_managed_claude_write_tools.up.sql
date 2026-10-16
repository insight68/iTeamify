-- Grant the platform-created managed Claude agent the generic write gateway.
--
-- Agents authored on the shared managed Claude runtime store a fixed
-- ITEAMIFY_MCP_TOOL_ALLOWLIST that was, until now, exactly the read-only
-- (read + preview) tool set. This adds the single generic write gateway
-- resource_action_execute so those agents can drive the assistant resource
-- registry. Tool visibility is not the authorization boundary: every write
-- still requires a human-originated chat task, a real user message id from the
-- current input batch, explicit confirmation, a fresh idempotency key, an
-- expected version where applicable, and a role the action allows.
--
-- The WHERE clause matches the exact read-only allowlist, so a row that was
-- never touched is upgraded while any drifted row is left alone and keeps
-- failing closed at claim time. The OpenAgent policy is intentionally not
-- touched and stays read-only.

UPDATE agent
SET mcp_config = jsonb_set(
        mcp_config,
        '{mcpServers,iteamify,env,ITEAMIFY_MCP_TOOL_ALLOWLIST}',
        to_jsonb('company_context_get,company_profile_get,lead_get,lead_search,quote_list,resource_action_preview,resource_catalog,resource_describe,resource_get,resource_query,table_get_schema,table_query,resource_action_execute'::text),
        false
    )
WHERE execution_policy_key = 'workspace_managed_claude_v1'
  AND mcp_config #>> '{mcpServers,iteamify,env,ITEAMIFY_MCP_TOOL_ALLOWLIST}' =
      'company_context_get,company_profile_get,lead_get,lead_search,quote_list,resource_action_preview,resource_catalog,resource_describe,resource_get,resource_query,table_get_schema,table_query';
