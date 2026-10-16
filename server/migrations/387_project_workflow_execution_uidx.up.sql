CREATE UNIQUE INDEX CONCURRENTLY project_workflow_execution_uidx ON project_workflow (execution_issue_id) WHERE execution_issue_id IS NOT NULL;
