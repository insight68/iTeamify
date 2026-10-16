-- name: CreateAgentMCPToolInvocation :execrows
INSERT INTO mcp_tool_invocation (
    id,
    surface,
    server_name,
    tool_name,
    workspace_id,
    agent_id,
    task_id,
    runtime_id,
    succeeded,
    duration_ms
)
SELECT
    @id,
    'agent_task',
    'iteamify',
    @tool_name,
    a.workspace_id,
    t.agent_id,
    t.id,
    t.runtime_id,
    @succeeded,
    @duration_ms
FROM agent_task_queue t
JOIN agent a ON a.id = t.agent_id
WHERE t.id = @task_id
  AND t.agent_id = @agent_id
  AND a.workspace_id = @workspace_id
ON CONFLICT (id) DO NOTHING;

