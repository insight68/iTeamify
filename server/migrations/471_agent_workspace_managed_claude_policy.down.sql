UPDATE agent
SET execution_policy_key = 'general'
WHERE execution_policy_key = 'workspace_managed_claude_v1';

ALTER TABLE agent
    DROP CONSTRAINT IF EXISTS agent_execution_policy_key_check;

ALTER TABLE agent
    ADD CONSTRAINT agent_execution_policy_key_check CHECK (
        execution_policy_key IN (
            'general',
            'managed_chat_v1',
            'workspace_openagent_v1'
        )
    );
