DROP TABLE IF EXISTS agent_blueprint_suggestion;
DROP TABLE IF EXISTS skill_blueprint_origin;
DROP TABLE IF EXISTS agent_blueprint_origin;

ALTER TABLE agent
    DROP COLUMN IF EXISTS execution_policy_key;
