-- Remove the customer-pool price fields from the shared billing settings.
ALTER TABLE billing_settings
    DROP COLUMN IF EXISTS customer_pool_price_micro,
    DROP COLUMN IF EXISTS customer_pool_price_version;

-- Retire only the removed first-party tools; preserve the other MCP configuration.
UPDATE agent
SET mcp_config = jsonb_set(
    mcp_config,
    '{mcpServers,iteamify,env,ITEAMIFY_MCP_TOOL_ALLOWLIST}',
    to_jsonb(COALESCE((
        SELECT string_agg(tool, ',' ORDER BY position)
        FROM unnest(string_to_array(mcp_config #>> '{mcpServers,iteamify,env,ITEAMIFY_MCP_TOOL_ALLOWLIST}', ',')) WITH ORDINALITY AS tools(tool, position)
        WHERE btrim(tool) !~ '^(lead_|quote_)'
          AND btrim(tool) NOT IN ('table_get_schema', 'table_query')
    ), '')),
    false
)
WHERE mcp_config #>> '{mcpServers,iteamify,env,ITEAMIFY_MCP_TOOL_ALLOWLIST}' IS NOT NULL;
