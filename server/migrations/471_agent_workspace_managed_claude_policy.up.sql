-- Workspace-authored Agents may use the shared managed Claude runtime without
-- claiming provenance from an installed Blueprint release. The dispatch layer
-- gives this value a separate, fail-closed execution contract.
ALTER TABLE agent
    DROP CONSTRAINT IF EXISTS agent_execution_policy_key_check;

ALTER TABLE agent
    ADD CONSTRAINT agent_execution_policy_key_check CHECK (
        execution_policy_key IN (
            'general',
            'managed_chat_v1',
            'workspace_managed_claude_v1',
            'workspace_openagent_v1'
        )
    );
