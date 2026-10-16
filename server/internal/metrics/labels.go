package metrics

import (
	"regexp"
	"strings"

	"github.com/iteamify-ai/iteamify/server/pkg/taskfailure"
)

const (
	labelSource         = "source"
	labelRuntimeMode    = "runtime_mode"
	labelProvider       = "provider"
	labelTerminalStatus = "terminal_status"
	labelFailureReason  = "failure_reason"
	labelTokenType      = "token_type"
	labelModel          = "model"
	labelModelAlias     = "model_alias"

	// PR3 labels (funnel / community / commercial).
	labelSignupSource = "signup_source"
	labelPlatform     = "platform"
	labelPath         = "path"
	labelCadence      = "cadence"
	labelTriggerKind  = "trigger_kind"
	labelReason       = "reason"
	labelRecoverable  = "recoverable"
	labelKind         = "kind"
	labelStatus       = "status"
	labelEventKind    = "event_kind"
	labelAction       = "action"
	labelResult       = "result"
	labelOp           = "op"
	labelGate         = "gate"
	labelTrigger      = "trigger"
	labelStage        = "stage"
	labelOutcome      = "outcome"
	labelErrorCode    = "error_code"
)

var businessMetricLabels = map[string][]string{
	"iteamify_agent_task_enqueued_total":     {labelSource, labelRuntimeMode},
	"iteamify_agent_task_dispatched_total":   {labelSource, labelRuntimeMode},
	"iteamify_agent_task_started_total":      {labelSource, labelRuntimeMode, labelProvider},
	"iteamify_agent_task_terminal_total":     {labelSource, labelRuntimeMode, labelTerminalStatus},
	"iteamify_agent_task_failed_total":       {labelSource, labelRuntimeMode, labelFailureReason},
	"iteamify_agent_task_queue_wait_seconds": {labelSource, labelRuntimeMode},
	"iteamify_agent_task_run_seconds":        {labelSource, labelRuntimeMode, labelTerminalStatus},
	"iteamify_agent_task_total_seconds":      {labelSource, labelRuntimeMode, labelTerminalStatus},
	"iteamify_agent_task_in_progress":        {labelSource, labelRuntimeMode},
	"iteamify_agent_task_iteration_count":    {labelSource, labelTerminalStatus},
	"iteamify_llm_tokens_total":              {labelProvider, labelModel, labelTokenType, labelRuntimeMode, labelSource},
	"iteamify_llm_cost_usd_total":            {labelProvider, labelModel, labelTokenType, labelRuntimeMode, labelSource},
	"iteamify_llm_unpriced_tokens_total":     {labelProvider, labelModelAlias, labelTokenType},
	"iteamify_llm_request_total":             {labelProvider, labelModel, labelRuntimeMode},
	"iteamify_task_queued_expired_total":     {labelSource, labelRuntimeMode},
	"iteamify_task_lease_expired_total":      {labelSource},

	// PR3 funnel / community / commercial.
	"iteamify_signup_total":                             {labelSignupSource},
	"iteamify_workspace_created_total":                  {labelSource},
	"iteamify_team_invite_sent_total":                   {},
	"iteamify_team_invite_accepted_total":               {},
	"iteamify_onboarding_started_total":                 {labelPlatform},
	"iteamify_onboarding_questionnaire_submitted_total": {},
	"iteamify_onboarding_source_submitted_total":        {},
	"iteamify_onboarding_completed_total":               {labelPath},
	"iteamify_cloud_waitlist_joined_total":              {},
	"iteamify_issue_created_total":                      {labelSource, labelPlatform},
	"iteamify_chat_message_sent_total":                  {labelPlatform},
	"iteamify_agent_created_total":                      {labelRuntimeMode, labelSource},
	"iteamify_squad_created_total":                      {},
	"iteamify_autopilot_created_total":                  {labelCadence},
	"iteamify_issue_executed_total":                     {labelSource},
	"iteamify_runtime_registered_total":                 {labelRuntimeMode, labelProvider},
	"iteamify_runtime_ready_total":                      {labelRuntimeMode, labelProvider},
	"iteamify_runtime_ready_seconds":                    {labelRuntimeMode, labelProvider},
	"iteamify_runtime_failed_total":                     {labelRuntimeMode, labelProvider, labelFailureReason, labelRecoverable},
	"iteamify_runtime_offline_total":                    {labelRuntimeMode, labelProvider},
	"iteamify_daemon_ws_message_received_total":         {labelKind},
	"iteamify_autopilot_run_started_total":              {labelCadence, labelTriggerKind},
	"iteamify_autopilot_run_terminal_total":             {labelCadence, labelTriggerKind, labelTerminalStatus},
	"iteamify_autopilot_run_skipped_total":              {labelCadence, labelReason},
	"iteamify_webhook_delivery_total":                   {labelProvider, labelStatus},
	"iteamify_webhook_rate_limited_total":               {labelGate},
	"iteamify_github_event_received_total":              {labelEventKind, labelAction},
	"iteamify_github_pr_review_total":                   {labelResult},
	"iteamify_cloudruntime_request_total":               {labelOp, labelStatus},
	"iteamify_cloudruntime_request_duration_seconds":    {labelOp},
	"iteamify_feedback_submitted_total":                 {labelKind, labelPlatform},
	"iteamify_contact_sales_submitted_total":            {labelSource},
	"iteamify_chat_output_local_path_total":             {labelKind},
}

var forbiddenMetricLabels = map[string]struct{}{
	"workspace_id": {},
	"user_id":      {},
	"agent_id":     {},
	"task_id":      {},
	"issue_id":     {},
	"runtime_id":   {},
	"session_id":   {},
	"ip":           {},
}

var (
	knownSources = map[string]string{
		"issue":           "issue",
		"chat":            "chat",
		"autopilot":       "autopilot",
		"autopilot_issue": "autopilot_issue",
		"quick_create":    "quick_create",
		"manual":          "manual",
		"api":             "api",
		"other":           "other",
	}
	knownRuntimeModes = map[string]string{
		"local":   "local",
		"cloud":   "cloud",
		"unknown": "unknown",
	}
	knownRuntimeProviders = map[string]string{
		"antigravity":    "antigravity",
		"claude":         "claude",
		"codebuddy":      "codebuddy",
		"codex":          "codex",
		"copilot":        "copilot",
		"cursor":         "cursor",
		"gemini":         "gemini",
		"grok":           "grok",
		"hermes":         "hermes",
		"kiro":           "kiro",
		"kimi":           "kimi",
		"iteamify_agent": "iteamify_agent",
		"openclaw":       "openclaw",
		"opencode":       "opencode",
		"deveco":         "deveco",
		"pi":             "pi",
		"qwen":           "qwen",
		"other":          "other",
	}
	knownTerminalStatuses = map[string]string{
		"completed": "completed",
		"failed":    "failed",
		"cancelled": "cancelled",
		"blocked":   "blocked",
		"other":     "other",
	}
	knownTokenTypes = map[string]string{
		"input":       "input",
		"output":      "output",
		"cache_read":  "cache_read",
		"cache_write": "cache_write",
	}
	knownFailureReasons = map[string]string{}
	modelAliasUnsafeRe  = regexp.MustCompile(`[^a-z0-9._:/+-]+`)
)

func init() {
	for _, reason := range taskfailure.AllReasons() {
		knownFailureReasons[reason.String()] = reason.String()
	}
}

func validateBusinessMetricLabels() {
	for metric, labels := range businessMetricLabels {
		for _, label := range labels {
			if _, forbidden := forbiddenMetricLabels[label]; forbidden {
				panic("forbidden high-cardinality label " + label + " on " + metric)
			}
		}
	}
}

func metricLabels(metric string) []string {
	labels, ok := businessMetricLabels[metric]
	if !ok {
		panic("missing business metric label definition for " + metric)
	}
	return labels
}

func NormalizeTaskSource(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if normalized, ok := knownSources[value]; ok {
		return normalized
	}
	return "other"
}

func NormalizeRuntimeMode(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if normalized, ok := knownRuntimeModes[value]; ok {
		return normalized
	}
	return "unknown"
}

func NormalizeRuntimeProvider(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if normalized, ok := knownRuntimeProviders[value]; ok {
		return normalized
	}
	return "other"
}

func NormalizeTerminalStatus(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if normalized, ok := knownTerminalStatuses[value]; ok {
		return normalized
	}
	return "other"
}

func NormalizeFailureReason(value string) string {
	value = strings.TrimSpace(value)
	if normalized, ok := knownFailureReasons[value]; ok {
		return normalized
	}
	return taskfailure.Classify(value).String()
}

func NormalizeTokenType(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if normalized, ok := knownTokenTypes[value]; ok {
		return normalized
	}
	return "input"
}

func NormalizeModelAlias(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return "unknown"
	}
	value = modelAliasUnsafeRe.ReplaceAllString(value, "_")
	if len(value) > 128 {
		return value[:128]
	}
	return value
}
