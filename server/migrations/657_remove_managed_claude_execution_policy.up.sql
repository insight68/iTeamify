-- Retire only the removed Claude execution contract. Local Claude runtimes,
-- OpenAgent, managed releases, and workspace provisioning keep their schemas.
ALTER TABLE agent
    DROP CONSTRAINT IF EXISTS agent_execution_policy_key_check;

ALTER TABLE agent
    ADD CONSTRAINT agent_execution_policy_key_check CHECK (
        execution_policy_key IN ('general', 'managed_chat_v1', 'workspace_openagent_v1')
    );
