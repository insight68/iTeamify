package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"

	sdkagent "github.com/codeany-ai/open-agent-sdk-go/agent"
	"github.com/codeany-ai/open-agent-sdk-go/types"
)

const (
	managedOpenAgentMaxTurns  = 24
	managedOpenAgentMaxBudget = 5.0
	managedOpenAgentTimeout   = 15 * time.Minute
)

// openagentBackend runs the SDK inside the daemon while preserving the common
// Backend streaming contract. Managed executions use a fail-closed MCP-only
// policy; standalone callers retain the SDK's historical host capabilities.
type openagentBackend struct{ cfg Config }

// Execute starts one in-process Agent. Every call owns an Agent instance; only
// immutable engine code and daemon capacity are shared between workspaces.
func (b *openagentBackend) Execute(ctx context.Context, prompt string, opts ExecOptions) (*Session, error) {
	if opts.ManagedRuntime {
		if opts.Timeout <= 0 || opts.Timeout > managedOpenAgentTimeout {
			opts.Timeout = managedOpenAgentTimeout
		}
		if opts.MaxTurns <= 0 || opts.MaxTurns > managedOpenAgentMaxTurns {
			opts.MaxTurns = managedOpenAgentMaxTurns
		}
	}

	store, err := newOpenAgentSessionStore(opts.Cwd)
	if err != nil {
		return nil, fmt.Errorf("openagent: prepare session store: %w", err)
	}
	opts.Cwd = store.cwd

	runCtx, cancel := runContext(ctx, opts.Timeout)

	sdkOpts, err := mapExecOptionsToSDK(opts, b.cfg)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("openagent: map options: %w", err)
	}
	if opts.ResumeSessionID != "" {
		snapshot, loadErr := store.load(opts.ResumeSessionID)
		if loadErr != nil {
			cancel()
			if isOpenAgentResumeRejected(loadErr) {
				return completedSession(Result{
					Status:         "failed",
					Error:          sanitizeAgentDiagnostic(loadErr.Error()),
					ResumeRejected: true,
					Usage:          map[string]TokenUsage{},
				}), nil
			}
			return nil, fmt.Errorf("openagent: load session: %w", loadErr)
		}
		sdkOpts.SessionID = snapshot.SessionID
		sdkOpts.InitialMessages = snapshot.Messages
	}

	msgCh := make(chan Message, 256)
	resCh := make(chan Result, 1)
	checkpointSaved := false
	initialMessageCount := len(sdkOpts.InitialMessages)
	sdkOpts.OnCheckpoint = func(sessionID string, messages []types.Message) error {
		if saveErr := store.save(openAgentSessionSnapshot{
			Version: openAgentSessionVersion, SessionID: sessionID, CWD: store.cwd, Messages: messages,
		}); saveErr != nil {
			return fmt.Errorf("openagent checkpoint persistence failed: %w", saveErr)
		}
		checkpointSaved = true
		if opts.OnSessionCheckpoint != nil {
			usage := openAgentMessageUsage(messages[initialMessageCount:], sdkOpts.Model)
			if err := opts.OnSessionCheckpoint(sessionID, usage); err != nil {
				return fmt.Errorf("openagent checkpoint report persistence failed: %w", err)
			}
		}
		// A resume pointer is published only after the complete round is durable.
		sendOpenAgentMessage(runCtx, msgCh, Message{Type: MessageStatus, SessionID: sessionID})
		return nil
	}

	a := sdkagent.New(sdkOpts)
	if err := a.Init(runCtx); err != nil {
		cancel()
		a.Close()
		return nil, fmt.Errorf("openagent: init (MCP connect): %w", err)
	}
	b.cfg.Logger.Info("openagent started", "model", sdkOpts.Model, "cwd", opts.Cwd, "mcp_servers", len(sdkOpts.MCPServers))

	go func() {
		defer cancel()
		defer close(msgCh)
		defer close(resCh)
		defer a.Close()
		resultSent := false
		defer func() {
			if recovered := recover(); recovered != nil && !resultSent {
				b.cfg.Logger.Error("openagent panicked", "panic", recovered, "stack", string(debug.Stack()))
				resCh <- Result{Status: "failed", Error: "openagent: internal runtime failure", Usage: map[string]TokenUsage{}}
			}
		}()

		startTime := time.Now()
		events, errCh := a.Query(runCtx, prompt)
		sessionID := a.SessionID()
		finalResult := Result{Status: "failed", Error: "openagent: agent loop ended without result", Usage: map[string]TokenUsage{}}
		for ev := range events {
			switch ev.Type {
			case types.MessageTypeAssistantDelta:
				if ev.Message != nil {
					for _, block := range ev.Message.Content {
						if block.Type == types.ContentBlockText && block.Text != "" {
							sendOpenAgentMessage(runCtx, msgCh, Message{Type: MessageText, Content: block.Text})
						}
						if block.Type == types.ContentBlockThinking && block.Thinking != "" {
							sendOpenAgentMessage(runCtx, msgCh, Message{Type: MessageThinking, Content: block.Thinking})
						}
					}
				}
			case types.MessageTypeAssistant:
				if ev.Message != nil {
					for _, block := range ev.Message.Content {
						if block.Type == types.ContentBlockToolUse {
							sendOpenAgentMessage(runCtx, msgCh, Message{Type: MessageToolUse, Tool: block.Name, CallID: block.ID, Input: block.Input})
						}
					}
				}
			case "tool_result":
				if ev.Message != nil {
					for _, block := range ev.Message.Content {
						if block.Type == types.ContentBlockToolResult {
							output := openAgentToolOutput(block.Content)
							if block.IsError {
								output = "Error: " + output
							}
							sendOpenAgentMessage(runCtx, msgCh, Message{Type: MessageToolResult, CallID: block.ToolUseID, Output: output})
						}
					}
				}
			case types.MessageTypeResult:
				finalResult = buildResultFromSDK(ev, sessionID, strings.TrimSpace(sdkOpts.Model), map[string]TokenUsage{}, startTime)
			}
		}
		if queryErr := <-errCh; queryErr != nil && finalResult.Status == "completed" {
			finalResult.Status = "failed"
			finalResult.Error = sanitizeAgentDiagnostic(queryErr.Error())
		}

		if !checkpointSaved {
			// Save a valid pre-response history on early failure as well. Never
			// overwrite a complete checkpoint with an unfinished tool round.
			if saveErr := store.save(openAgentSessionSnapshot{
				Version: openAgentSessionVersion, SessionID: sessionID, CWD: store.cwd, Messages: a.GetMessages(),
			}); saveErr != nil {
				b.cfg.Logger.Error("openagent session persistence failed", "session_id", sessionID, "error", saveErr)
				finalResult.SessionID = ""
			}
		}
		resCh <- finalResult
		resultSent = true
	}()
	return &Session{Messages: msgCh, Result: resCh}, nil
}

// sendOpenAgentMessage applies backpressure while a task is live and lets a
// cancelled consumer release the backend instead of silently losing events.
func sendOpenAgentMessage(ctx context.Context, ch chan<- Message, message Message) {
	select {
	case ch <- message:
	case <-ctx.Done():
	}
}

func openAgentToolOutput(blocks []types.ContentBlock) string {
	var output strings.Builder
	for _, block := range blocks {
		if block.Type == types.ContentBlockText {
			output.WriteString(block.Text)
		}
		output.WriteString(openAgentToolOutput(block.Content))
	}
	return output.String()
}

func openAgentMessageUsage(messages []types.Message, configuredModel string) map[string]TokenUsage {
	usage := make(map[string]TokenUsage)
	for _, msg := range messages {
		if msg.Usage == nil {
			continue
		}
		model := msg.Model
		if model == "" {
			model = configuredModel
		}
		u := usage[model]
		u.InputTokens += int64(msg.Usage.InputTokens)
		u.OutputTokens += int64(msg.Usage.OutputTokens)
		u.CacheReadTokens += int64(msg.Usage.CacheReadInputTokens)
		u.CacheWriteTokens += int64(msg.Usage.CacheCreationInputTokens)
		usage[model] = u
	}
	return usage
}

// extractToolUseID 从 SDK tool_result 事件的 message content 里提取 tool_use_id。
// SDK loop.go 把 tool_result 包成 ContentBlockToolResult，ID 在 ToolUseID 字段。
func extractToolUseID(msg *types.Message) string {
	if msg == nil {
		return ""
	}
	for _, blk := range msg.Content {
		if blk.Type == types.ContentBlockToolResult && blk.ToolUseID != "" {
			return blk.ToolUseID
		}
	}
	return ""
}

// buildResultFromSDK 把 SDK 的 result 事件转为 daemon 的 Result。
// SDK 的 Usage 是单 model 的累积值；daemon 的 Result.Usage 是 map[model]TokenUsage。
func buildResultFromSDK(ev types.SDKMessage, sessionID, configuredModel string, usage map[string]TokenUsage, startTime time.Time) Result {
	status := "failed"
	errorMessage := ev.Error
	switch ev.StopReason {
	case "end_turn", "stop_sequence":
		if errorMessage == "" {
			status = "completed"
		}
	case "cancelled", "timeout":
		status = ev.StopReason
	}
	if status != "completed" && errorMessage == "" {
		errorMessage = fmt.Sprintf("openagent: execution stopped (%s)", ev.StopReason)
	}

	// 把 SDK 的 Usage 累积到 usage map。SDK 的 QueryResult.Usage 是单次执行的
	// 总量，model 从 ev.Message.Model 或 configuredModel 取。
	model := configuredModel
	if ev.Message != nil && ev.Message.Model != "" {
		model = ev.Message.Model
	}
	if model == "" {
		model = "openagent"
	}

	if len(ev.UsageByModel) > 0 {
		for name, total := range ev.UsageByModel {
			usage[name] = TokenUsage{InputTokens: int64(total.InputTokens), OutputTokens: int64(total.OutputTokens),
				CacheReadTokens: int64(total.CacheReadInputTokens), CacheWriteTokens: int64(total.CacheCreationInputTokens)}
		}
	} else if ev.Usage != nil {
		u := usage[model]
		u.InputTokens += int64(ev.Usage.InputTokens)
		u.OutputTokens += int64(ev.Usage.OutputTokens)
		u.CacheReadTokens += int64(ev.Usage.CacheReadInputTokens)
		u.CacheWriteTokens += int64(ev.Usage.CacheCreationInputTokens)
		usage[model] = u
	}

	durationMs := ev.Duration
	if durationMs <= 0 {
		durationMs = time.Since(startTime).Milliseconds()
	}

	return Result{
		Status:     status,
		Error:      sanitizeAgentDiagnostic(errorMessage),
		Output:     ev.Text,
		DurationMs: durationMs,
		SessionID:  sessionID,
		Usage:      usage,
	}
}

// mapExecOptionsToSDK is the anti-corruption boundary between the daemon and
// the embedded SDK. Managed execution never receives the daemon task/process
// environment and exposes only the task-scoped first-party MCP allowlist.
func mapExecOptionsToSDK(opts ExecOptions, cfg Config) (sdkagent.Options, error) {
	sdkOpts := sdkagent.Options{
		Model:          opts.Model,
		CWD:            opts.Cwd,
		SystemPrompt:   opts.SystemPrompt,
		MaxTurns:       opts.MaxTurns,
		TimeoutMs:      int(opts.Timeout.Milliseconds()),
		Env:            cfg.Env,
		PermissionMode: types.PermissionModeBypassPermissions,
	}

	if opts.ManagedRuntime {
		if cfg.ModelEndpoint == nil || strings.TrimSpace(cfg.ModelEndpoint.APIKey) == "" ||
			strings.TrimSpace(cfg.ModelEndpoint.BaseURL) == "" || strings.TrimSpace(cfg.ModelEndpoint.Model) == "" {
			return sdkOpts, fmt.Errorf("managed model endpoint is incomplete")
		}
		if cfg.ModelEndpoint.Provider != "anthropic" && cfg.ModelEndpoint.Provider != "openai" {
			return sdkOpts, fmt.Errorf("managed model provider %q is unsupported", cfg.ModelEndpoint.Provider)
		}
		if !filepath.IsAbs(opts.Cwd) {
			return sdkOpts, fmt.Errorf("managed working directory must be absolute")
		}
		if strings.TrimSpace(opts.SystemPrompt) == "" {
			return sdkOpts, fmt.Errorf("managed system prompt is required")
		}

		servers, allowedTools, err := managedOpenAgentMCPConfig(opts.McpConfig)
		if err != nil {
			return sdkOpts, err
		}
		sdkOpts.HTTPClient = cfg.ModelEndpoint.HTTPClient
		sdkOpts.APIKey = cfg.ModelEndpoint.APIKey
		sdkOpts.BaseURL = cfg.ModelEndpoint.BaseURL
		sdkOpts.Provider = cfg.ModelEndpoint.Provider
		sdkOpts.Model = cfg.ModelEndpoint.Model
		sdkOpts.Env = nil
		sdkOpts.Isolation = &sdkagent.IsolationPolicy{}
		sdkOpts.RequireMCPServers = true
		sdkOpts.MCPServers = servers
		sdkOpts.AllowedTools = allowedTools
		sdkOpts.PermissionMode = types.PermissionModeDontAsk
		sdkOpts.MaxBudgetUSD = managedOpenAgentMaxBudget
	} else if hasManagedMcpConfig(opts.McpConfig) {
		servers, err := parseOpenAgentMCPConfig(opts.McpConfig)
		if err != nil {
			return sdkOpts, err
		}
		sdkOpts.MCPServers = servers
	}

	// ThinkingLevel: runtime-native reasoning effort。
	// 不同 provider 的值域不同（Claude: low|medium|high|xhigh|max；
	// Codex: none|minimal|low|medium|high|xhigh）。SDK 的 Effort 值域是
	// low|medium|high|max，语义对齐。空值不设置，SDK 用模型默认。
	if lvl := strings.TrimSpace(opts.ThinkingLevel); lvl != "" {
		switch strings.ToLower(lvl) {
		case "none", "minimal":
			// 显式禁用思考 —— SDK 不设置 Effort 也不设置 Thinking，
			// 走模型默认（多数模型默认不开 thinking）。
		case "low":
			sdkOpts.Effort = sdkagent.EffortLow
		case "medium":
			sdkOpts.Effort = sdkagent.EffortMedium
		case "high":
			sdkOpts.Effort = sdkagent.EffortHigh
		case "xhigh", "max":
			sdkOpts.Effort = sdkagent.EffortMax
		default:
			// 未知值不阻断执行，按 medium 兜底。
			sdkOpts.Effort = sdkagent.EffortMedium
		}
	}

	return sdkOpts, nil
}

func parseOpenAgentMCPConfig(raw json.RawMessage) (map[string]types.MCPServerConfig, error) {
	var document struct {
		MCPServers map[string]types.MCPServerConfig `json:"mcpServers"`
	}
	if err := json.Unmarshal(raw, &document); err != nil {
		return nil, fmt.Errorf("parse mcp config: %w", err)
	}
	return document.MCPServers, nil
}

func managedOpenAgentMCPConfig(raw json.RawMessage) (map[string]types.MCPServerConfig, []string, error) {
	if !hasManagedMcpConfig(raw) {
		return nil, nil, fmt.Errorf("managed OpenAgent requires task-scoped iTeamify MCP")
	}
	servers, err := parseOpenAgentMCPConfig(raw)
	if err != nil {
		return nil, nil, err
	}
	if len(servers) != 1 {
		return nil, nil, fmt.Errorf("managed OpenAgent allows exactly one MCP server")
	}
	iteamify, ok := servers["iteamify"]
	if !ok {
		return nil, nil, fmt.Errorf("managed OpenAgent allows only the iTeamify MCP server")
	}
	if (iteamify.Type != "" && iteamify.Type != types.MCPTransportStdio) || !filepath.IsAbs(iteamify.Command) ||
		len(iteamify.Args) != 2 || iteamify.Args[0] != "mcp" || iteamify.Args[1] != "serve" ||
		iteamify.URL != "" || len(iteamify.Headers) != 0 || iteamify.Server != nil {
		return nil, nil, fmt.Errorf("managed iTeamify MCP transport is invalid")
	}

	allowedEnv := map[string]struct{}{
		"ITEAMIFY_TOKEN": {}, "ITEAMIFY_SERVER_URL": {}, "ITEAMIFY_DAEMON_PORT": {},
		"ITEAMIFY_WORKSPACE_ID": {}, "ITEAMIFY_AGENT_NAME": {}, "ITEAMIFY_AGENT_ID": {},
		"ITEAMIFY_TASK_ID": {}, "ITEAMIFY_TASK_SLOT": {}, "ITEAMIFY_MCP_TOOL_ALLOWLIST": {},
	}
	for key := range iteamify.Env {
		if _, ok := allowedEnv[key]; !ok {
			return nil, nil, fmt.Errorf("managed iTeamify MCP environment key %q is not allowed", key)
		}
	}
	for _, key := range []string{"ITEAMIFY_TOKEN", "ITEAMIFY_SERVER_URL", "ITEAMIFY_WORKSPACE_ID", "ITEAMIFY_AGENT_ID", "ITEAMIFY_TASK_ID", "ITEAMIFY_MCP_TOOL_ALLOWLIST"} {
		if strings.TrimSpace(iteamify.Env[key]) == "" {
			return nil, nil, fmt.Errorf("managed iTeamify MCP environment key %q is required", key)
		}
	}

	seen := make(map[string]struct{})
	allowedTools := make([]string, 0)
	for _, tool := range strings.Split(iteamify.Env["ITEAMIFY_MCP_TOOL_ALLOWLIST"], ",") {
		tool = strings.TrimSpace(tool)
		if !validManagedOpenAgentToolName(tool) {
			return nil, nil, fmt.Errorf("managed iTeamify MCP tool %q is invalid", tool)
		}
		if _, duplicate := seen[tool]; duplicate {
			return nil, nil, fmt.Errorf("managed iTeamify MCP tool %q is duplicated", tool)
		}
		seen[tool] = struct{}{}
		allowedTools = append(allowedTools, "mcp__iteamify__"+tool)
	}
	if len(allowedTools) == 0 {
		return nil, nil, fmt.Errorf("managed iTeamify MCP tool allowlist is empty")
	}
	return servers, allowedTools, nil
}

func validManagedOpenAgentToolName(name string) bool {
	if name == "" || strings.Contains(name, "__") {
		return false
	}
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') || r == '_' || r == '-' {
			continue
		}
		return false
	}
	return true
}
