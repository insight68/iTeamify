ALTER TABLE task_usage DROP COLUMN settled_credit_micro;
ALTER TABLE agent_task_queue DROP COLUMN local_billing_enabled;
DROP TABLE billing_settings;
DROP TABLE workspace_topup_order;
DROP TABLE workspace_credit_ledger;
DROP TABLE workspace_credit_account;
