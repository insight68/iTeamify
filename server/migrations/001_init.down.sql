-- Remove only objects owned by the baseline; shared extensions remain installed.

DROP TABLE public."workspace_topup_order";

DROP TABLE public."workspace_openagent_config";

DROP TABLE public."workspace_invitation";

DROP TABLE public."workspace_credit_operation_outbox";

DROP TABLE public."workspace_credit_ledger";

DROP TABLE public."workspace_credit_account";

DROP TABLE public."workspace";

DROP TABLE public."webhook_delivery";

DROP TABLE public."verification_code";

DROP TABLE public."vcs_pull_request";

DROP TABLE public."vcs_connection";

DROP TABLE public."vcs_commit_status";

DROP TABLE public."user_password";

DROP TABLE public."user_gmail_connection";

DROP TABLE public."user_composio_connection";

DROP TABLE public."user";

DROP TABLE public."token_credit_rate";

DROP TABLE public."task_usage_hourly_rollup_state";

DROP TABLE public."task_usage_hourly_dirty";

DROP TABLE public."task_usage_hourly";

DROP TABLE public."task_usage";

DROP TABLE public."task_token_credit_rate_snapshot";

DROP TABLE public."task_token";

DROP TABLE public."task_message";

DROP TABLE public."sys_cron_executions";

DROP TABLE public."squad_member";

DROP TABLE public."squad";

DROP TABLE public."skill_to_label";

DROP TABLE public."skill_file";

DROP TABLE public."skill";

DROP TABLE public."session_application";

DROP TABLE public."runtime_profile";

DROP TABLE public."reddit_request_budget";

DROP TABLE public."reddit_reply_draft";

DROP TABLE public."reddit_oauth_state";

DROP TABLE public."reddit_connection";

DROP TABLE public."project_resource";

DROP TABLE public."project";

DROP TABLE public."pinned_item";

DROP TABLE public."personal_access_token";

DROP TABLE public."password_login_attempt";

DROP TABLE public."outbound_email";

DROP TABLE public."notification_preference";

DROP TABLE public."member";

DROP TABLE public."mcp_tool_invocation";

DROP TABLE public."lark_user_binding";

DROP TABLE public."lark_outbound_card_message";

DROP TABLE public."lark_installation";

DROP TABLE public."lark_inbound_message_dedup";

DROP TABLE public."lark_inbound_audit";

DROP TABLE public."lark_chat_session_binding";

DROP TABLE public."lark_binding_token";

DROP TABLE public."issue_vcs_pull_request";

DROP TABLE public."issue_to_label";

DROP TABLE public."issue_subscriber";

DROP TABLE public."issue_reaction";

DROP TABLE public."issue_pull_request";

DROP TABLE public."issue_property";

DROP TABLE public."issue_label";

DROP TABLE public."issue_dependency";

DROP TABLE public."issue";

DROP TABLE public."inbox_item";

DROP TABLE public."gmail_sync_job";

DROP TABLE public."gmail_oauth_state";

DROP TABLE public."gmail_message";

DROP TABLE public."gmail_analysis_binding";

DROP TABLE public."github_pull_request_check_suite";

DROP TABLE public."github_pull_request_check_run";

DROP TABLE public."github_pull_request";

DROP TABLE public."github_pending_installation";

DROP TABLE public."github_pending_check_suite";

DROP TABLE public."github_installation";

DROP TABLE public."feedback";

DROP TABLE public."daemon_token";

DROP TABLE public."daemon_connection";

DROP TABLE public."contract_submission";

DROP TABLE public."contract_review_file";

DROP TABLE public."contract_review_action";

DROP TABLE public."contract_review";

DROP TABLE public."contact_sales_inquiry";

DROP TABLE public."comment_reaction";

DROP TABLE public."comment";

DROP TABLE public."client_usage_daily";

DROP TABLE public."chat_session";

DROP TABLE public."chat_pinned_agent";

DROP TABLE public."chat_message";

DROP TABLE public."chat_draft_restore";

DROP TABLE public."chat_context_resource";

DROP TABLE public."channel_user_binding";

DROP TABLE public."channel_outbound_card_message";

DROP TABLE public."channel_media_pending_object";

DROP TABLE public."channel_installation";

DROP TABLE public."channel_inbound_message_dedup";

DROP TABLE public."channel_inbound_audit";

DROP TABLE public."channel_chat_session_binding";

DROP TABLE public."channel_binding_token";

DROP TABLE public."business_release";

DROP TABLE public."business_context";

DROP TABLE public."business_change_proposal";

DROP TABLE public."billing_settings";

DROP TABLE public."autopilot_trigger";

DROP TABLE public."autopilot_subscriber";

DROP TABLE public."autopilot_run";

DROP TABLE public."autopilot_rule_version";

DROP TABLE public."autopilot_collaborator";

DROP TABLE public."autopilot";

DROP TABLE public."auth_challenge";

DROP TABLE public."attachment";

DROP TABLE public."assistant_operation";

DROP TABLE public."agent_to_label";

DROP TABLE public."agent_task_queue";

DROP TABLE public."agent_skill";

DROP TABLE public."agent_runtime";

DROP TABLE public."agent_invocation_target";

DROP TABLE public."agent";

DROP TABLE public."activity_log";

DROP FUNCTION public.task_usage_hourly_rollup_lag_seconds();

DROP FUNCTION public.task_usage_hour_bucket(timestamp with time zone);

DROP FUNCTION public.rollup_task_usage_hourly_window(timestamp with time zone, timestamp with time zone);

DROP FUNCTION public.rollup_task_usage_hourly();

DROP FUNCTION public.prune_task_usage_hourly_dirty(interval);

DROP FUNCTION public.enqueue_task_usage_hourly_dirty_for_tu();

DROP FUNCTION public.enqueue_task_usage_hourly_dirty_for_issue_project();

DROP FUNCTION public.enqueue_task_usage_hourly_dirty_for_issue_delete();

DROP FUNCTION public.enqueue_task_usage_hourly_dirty_for_atq();

DROP FUNCTION public.clear_runtime_mcp_overlay_on_terminal_state();
