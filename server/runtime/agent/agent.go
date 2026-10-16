package agent

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/codeany-ai/open-agent-sdk-go/api"
	"github.com/codeany-ai/open-agent-sdk-go/costtracker"
	"github.com/codeany-ai/open-agent-sdk-go/hooks"
	"github.com/codeany-ai/open-agent-sdk-go/mcp"
	"github.com/codeany-ai/open-agent-sdk-go/permissions"
	"github.com/codeany-ai/open-agent-sdk-go/tools"
	"github.com/codeany-ai/open-agent-sdk-go/types"
)

const (
	defaultMaxTurns = 100
)

// IsolationPolicy declares which host-owned inputs an Agent may inherit.
// A nil policy preserves the standalone SDK behavior. A non-nil zero value is
// deliberately fail-closed for shared, multi-tenant runtimes.
type IsolationPolicy struct {
	AllowBuiltinTools bool
	AllowProcessEnv   bool
	AllowHostContext  bool
}

// ThinkingType represents the type of thinking configuration.
type ThinkingType string

const (
	// ThinkingAdaptive allows the model to decide when to think.
	ThinkingAdaptive ThinkingType = "adaptive"
	// ThinkingEnabled forces extended thinking on every request.
	ThinkingEnabled ThinkingType = "enabled"
	// ThinkingDisabled disables extended thinking.
	ThinkingDisabled ThinkingType = "disabled"
)

// ThinkingConfig configures extended thinking.
type ThinkingConfig struct {
	// Type controls the thinking mode: "adaptive", "enabled", or "disabled".
	Type ThinkingType `json:"type"`
	// BudgetTokens is the max number of thinking tokens (only for "enabled" type).
	BudgetTokens int `json:"budget_tokens,omitempty"`
}

// Effort controls the reasoning effort level.
type Effort string

const (
	EffortLow    Effort = "low"
	EffortMedium Effort = "medium"
	EffortHigh   Effort = "high"
	EffortMax    Effort = "max"
)

// Options configures an Agent.
type Options struct {
	HTTPClient *http.Client

	// Model ID (e.g. "sonnet-4-6")
	Model string

	// API key
	APIKey string

	// API base URL override
	BaseURL string

	// API provider: "anthropic" or "openai" (auto-detected if empty)
	Provider string

	// Working directory for tools
	CWD string

	// Isolation controls access to daemon-host state. nil preserves the
	// standalone SDK defaults; shared runtimes should pass a non-nil policy.
	Isolation *IsolationPolicy

	// System prompt override
	SystemPrompt string

	// Append to default system prompt
	AppendSystemPrompt string

	// Maximum agentic turns per query
	MaxTurns int

	// Maximum concurrent safe tool calls per batch (default: 8).
	MaxConcurrentTools int

	// Maximum serialized model context bytes (default: 16 MiB).
	// An oversized request fails explicitly; history is never silently dropped.
	MaxContextBytes int

	// Maximum USD budget per query
	MaxBudgetUSD float64

	// Permission mode
	PermissionMode types.PermissionMode

	// Tool names to pre-approve
	AllowedTools []string

	// Permission handler callback
	CanUseTool types.CanUseToolFn

	// MCP server configurations
	MCPServers map[string]types.MCPServerConfig

	// RequireMCPServers makes initialization fail when no MCP server is
	// configured or any configured server cannot connect. Managed MCP-only
	// runtimes use this to avoid silently degrading to a tool-less Agent.
	RequireMCPServers bool

	// Custom tools to add
	CustomTools []types.Tool

	// Hook configuration
	Hooks hooks.HookConfig

	// Environment variables (for API key, model, etc.)
	Env map[string]string

	// Extended thinking configuration
	Thinking *ThinkingConfig

	// Effort level for automatic thinking configuration
	Effort Effort

	// FallbackModel to use if the primary model fails
	FallbackModel string

	// DisallowedTools are tool names to deny
	DisallowedTools []string

	// Betas are beta feature flags to enable
	Betas []string

	// SettingSources specifies setting sources: "user", "project", "local"
	SettingSources []string

	// EnableFileCheckpointing enables file state tracking
	EnableFileCheckpointing bool

	// Structured output JSON schema name and schema
	JSONSchema map[string]interface{}

	// Custom HTTP headers
	CustomHeaders map[string]string

	// Proxy URL for API requests
	ProxyURL string

	// API timeout in milliseconds
	TimeoutMs int

	// SessionID and InitialMessages restore an externally persisted
	// conversation. The SDK itself remains storage-agnostic.
	SessionID       string
	InitialMessages []types.Message

	// OnCheckpoint receives a complete conversation round, including all tool
	// results. Storage and publication of resume pointers belong to the caller.
	OnCheckpoint func(sessionID string, messages []types.Message) error

	// Subagent definitions
	Agents map[string]AgentDefinition
}

// AgentDefinition defines a subagent configuration.
type AgentDefinition struct {
	Description     string                           `json:"description"`
	Instructions    string                           `json:"instructions"`
	Tools           []string                         `json:"tools,omitempty"`
	DisallowedTools []string                         `json:"disallowedTools,omitempty"`
	Model           string                           `json:"model,omitempty"`
	Skills          []string                         `json:"skills,omitempty"`
	Memory          string                           `json:"memory,omitempty"`
	Effort          Effort                           `json:"effort,omitempty"`
	MaxTurns        int                              `json:"maxTurns,omitempty"`
	Background      bool                             `json:"background,omitempty"`
	PermissionMode  types.PermissionMode             `json:"permissionMode,omitempty"`
	MCPServers      map[string]types.MCPServerConfig `json:"mcpServers,omitempty"`
	InitialPrompt   string                           `json:"initialPrompt,omitempty"`
}

// Agent is the main agent that runs the agentic loop.
var (
	ErrQueryInProgress     = errors.New("agent query is already running")
	ErrAgentClosed         = errors.New("agent is closed")
	ErrAgentNotInitialized = errors.New("required MCP initialization has not completed")
)

// Agent serializes queries and owns cancellation of its active run.
type Agent struct {
	lifecycleMu  sync.Mutex
	historyMu    sync.RWMutex
	closed       bool
	queryRunning bool
	initialized  bool
	activeCancel context.CancelFunc

	opts         Options
	apiClient    *api.Client
	toolRegistry *tools.Registry
	mcpClient    *mcp.Client
	costTracker  *costtracker.Tracker
	hookManager  *hooks.Manager
	canUseTool   types.CanUseToolFn
	messages     []types.Message
	sessionID    string
}

// New creates a new Agent.
func New(opts Options) *Agent {
	resolveEnvOptions(&opts)

	sessionID := uuid.New().String()
	if opts.SessionID != "" {
		sessionID = opts.SessionID
	}

	apiClient := api.NewClient(api.ClientConfig{
		HTTPClient:         opts.HTTPClient,
		APIKey:             opts.APIKey,
		BaseURL:            opts.BaseURL,
		Model:              opts.Model,
		Provider:           api.Provider(opts.Provider),
		CustomHeaders:      opts.CustomHeaders,
		ProxyURL:           opts.ProxyURL,
		TimeoutMs:          opts.TimeoutMs,
		DisallowProcessEnv: opts.Isolation != nil && !opts.Isolation.AllowProcessEnv,
		MaxRequestBytes:    opts.MaxContextBytes,
	})

	allowBuiltinTools := opts.Isolation == nil || opts.Isolation.AllowBuiltinTools
	registry := tools.NewRegistry()
	if allowBuiltinTools {
		registry = tools.DefaultRegistry()
	}
	for _, t := range opts.CustomTools {
		registry.Register(t)
	}

	permConfig := &permissions.Config{Mode: opts.PermissionMode}
	if permConfig.Mode == "" {
		permConfig.Mode = types.PermissionModeBypassPermissions
	}
	canUseTool := opts.CanUseTool
	if canUseTool == nil {
		canUseTool = permissions.NewCanUseToolFn(permConfig, opts.AllowedTools)
	}

	hookManager := hooks.NewManager(opts.Hooks)

	inheritProcessEnv := opts.Isolation == nil || opts.Isolation.AllowProcessEnv
	a := &Agent{
		opts:         opts,
		apiClient:    apiClient,
		toolRegistry: registry,
		mcpClient: mcp.NewClientWithOptions(mcp.ClientOptions{
			InheritProcessEnv: inheritProcessEnv,
		}),
		costTracker: costtracker.NewTracker(sessionID),
		hookManager: hookManager,
		canUseTool:  canUseTool,
		messages:    cloneMessages(opts.InitialMessages),
		sessionID:   sessionID,
	}

	// Register AgentTool with subagent spawner if definitions provided
	if allowBuiltinTools && len(opts.Agents) > 0 {
		defs := make(map[string]tools.SubagentDefinition, len(opts.Agents))
		for name, def := range opts.Agents {
			defs[name] = tools.SubagentDefinition{
				Description:  def.Description,
				Instructions: def.Instructions,
				Tools:        def.Tools,
				Model:        def.Model,
			}
		}
		agentTool := tools.NewAgentTool(defs, a.spawnSubagent)
		registry.Register(agentTool)
	} else if allowBuiltinTools {
		// Register with default agent types even if none configured
		defaultDefs := map[string]tools.SubagentDefinition{
			"general-purpose": {Description: "General-purpose agent for complex multi-step tasks"},
			"explore":         {Description: "Fast agent for codebase exploration and search"},
			"plan":            {Description: "Planning agent for designing implementation strategies"},
		}
		agentTool := tools.NewAgentTool(defaultDefs, a.spawnSubagent)
		registry.Register(agentTool)
	}

	return a
}

// Init performs async initialization (MCP connections, etc.)
func (a *Agent) Init(ctx context.Context) error {
	a.lifecycleMu.Lock()
	defer a.lifecycleMu.Unlock()
	if a.closed {
		return ErrAgentClosed
	}
	if a.queryRunning {
		return ErrQueryInProgress
	}
	if a.initialized {
		return nil
	}
	if len(a.opts.MCPServers) == 0 {
		if a.opts.RequireMCPServers {
			return fmt.Errorf("at least one MCP server is required")
		}
		a.initialized = true
		return nil
	}

	for name, config := range a.opts.MCPServers {
		conn, err := a.mcpClient.ConnectServer(ctx, name, config)
		if err != nil {
			if a.opts.RequireMCPServers {
				return fmt.Errorf("connect required MCP server %q: %w", name, err)
			}
			fmt.Fprintf(os.Stderr, "[MCP] Failed to connect to %q: %v\n", name, err)
			continue
		}

		mcpTools := mcp.ToolsFromConnection(conn)
		if a.opts.RequireMCPServers && len(mcpTools) == 0 {
			return fmt.Errorf("required MCP server %q exposed no tools", name)
		}
		for _, t := range mcpTools {
			a.toolRegistry.Register(t)
		}
	}
	if a.opts.RequireMCPServers {
		if len(a.toolRegistry.All()) == 0 {
			return fmt.Errorf("required MCP servers exposed no tools")
		}
		for _, name := range a.opts.AllowedTools {
			if a.toolRegistry.Get(name) == nil {
				return fmt.Errorf("required MCP tool %q is unavailable", name)
			}
		}
	}

	a.initialized = true
	return nil
}

// QueryResult is the final result of a query.
type QueryResult struct {
	Text         string                 `json:"text"`
	Usage        types.Usage            `json:"usage"`
	UsageByModel map[string]types.Usage `json:"usage_by_model,omitempty"`
	NumTurns     int                    `json:"num_turns"`
	Duration     time.Duration          `json:"duration"`
	Messages     []types.Message        `json:"messages"`
	Cost         float64                `json:"cost"`
	StopReason   string                 `json:"stop_reason"`
}

type queryState struct {
	startedAt    time.Time
	usage        types.Usage
	usageByModel map[string]types.Usage
	turns        int
	lastText     string
	stopReason   string
}

func sendSDKMessage(ctx context.Context, ch chan<- types.SDKMessage, message types.SDKMessage) error {
	select {
	case ch <- message:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Query runs the agentic loop with streaming events.
func (a *Agent) Query(ctx context.Context, prompt string) (<-chan types.SDKMessage, <-chan error) {
	eventCh := make(chan types.SDKMessage, 64)
	errCh := make(chan error, 1)
	a.lifecycleMu.Lock()
	var admissionErr error
	if a.closed {
		admissionErr = ErrAgentClosed
	} else if a.queryRunning {
		admissionErr = ErrQueryInProgress
	} else if a.opts.RequireMCPServers && !a.initialized {
		admissionErr = ErrAgentNotInitialized
	}
	if admissionErr != nil {
		a.lifecycleMu.Unlock()
		eventCh <- types.SDKMessage{Type: types.MessageTypeResult, StopReason: "error", Error: admissionErr.Error()}
		errCh <- admissionErr
		close(eventCh)
		close(errCh)
		return eventCh, errCh
	}
	runCtx, cancel := context.WithCancel(ctx)
	a.activeCancel = cancel
	a.queryRunning = true
	a.lifecycleMu.Unlock()

	go func() {
		defer func() {
			cancel()
			a.lifecycleMu.Lock()
			a.activeCancel = nil
			a.queryRunning = false
			a.lifecycleMu.Unlock()
			close(eventCh)
			close(errCh)
		}()
		state := &queryState{startedAt: time.Now(), stopReason: "error", usageByModel: make(map[string]types.Usage)}
		var runErr error
		defer func() {
			if recovered := recover(); recovered != nil {
				runErr = fmt.Errorf("agent runtime panic: %v", recovered)
				state.stopReason = "runtime_error"
			}
			if errors.Is(runErr, context.DeadlineExceeded) {
				state.stopReason = "timeout"
			} else if errors.Is(runErr, context.Canceled) {
				state.stopReason = "cancelled"
			}
			result := types.SDKMessage{
				Type: types.MessageTypeResult, Text: state.lastText, Usage: &state.usage,
				NumTurns: state.turns, Duration: time.Since(state.startedAt).Milliseconds(),
				Cost: a.costTracker.TotalCost(), StopReason: state.stopReason,
				UsageByModel: state.usageByModel,
			}
			if runErr != nil {
				result.Error = runErr.Error()
			}
			// Prefer the terminal receipt even after cancellation. An abandoned,
			// full event queue must still let the query goroutine shut down.
			select {
			case eventCh <- result:
			default:
				// The active adapter drains events after cancellation. Give it
				// a bounded chance to receive the authoritative usage receipt.
				timer := time.NewTimer(time.Second)
				select {
				case eventCh <- result:
				case <-timer.C:
				}
				timer.Stop()
			}
			if runErr != nil {
				errCh <- runErr
			}
		}()
		runErr = a.runLoop(runCtx, prompt, eventCh, state)
	}()

	return eventCh, errCh
}

// Prompt runs a query and returns the final result (blocking).
func (a *Agent) Prompt(ctx context.Context, prompt string) (*QueryResult, error) {
	start := time.Now()
	eventCh, errCh := a.Query(ctx, prompt)

	var result QueryResult

	for event := range eventCh {
		switch event.Type {
		case types.MessageTypeResult:
			if event.Usage != nil {
				result.Usage = *event.Usage
			}
			result.NumTurns = event.NumTurns
			result.Cost = event.Cost
			result.Text = event.Text
			result.StopReason = event.StopReason
			result.UsageByModel = event.UsageByModel
		}
	}

	result.Duration = time.Since(start)
	result.Messages = a.GetMessages()
	return &result, <-errCh
}

// GetMessages returns conversation history.
func (a *Agent) GetMessages() []types.Message {
	a.historyMu.RLock()
	defer a.historyMu.RUnlock()
	return cloneMessages(a.messages)
}

func (a *Agent) appendMessage(message types.Message) {
	a.historyMu.Lock()
	defer a.historyMu.Unlock()
	a.messages = append(a.messages, cloneMessages([]types.Message{message})[0])
}

// Clear resets an idle conversation and rejects mutation during a query.
func (a *Agent) Clear() error {
	a.lifecycleMu.Lock()
	defer a.lifecycleMu.Unlock()
	if a.queryRunning {
		return ErrQueryInProgress
	}
	a.historyMu.Lock()
	defer a.historyMu.Unlock()
	a.messages = nil
	return nil
}

// Close cleans up resources.
func (a *Agent) Close() {
	a.lifecycleMu.Lock()
	if a.closed {
		a.lifecycleMu.Unlock()
		return
	}
	a.closed = true
	if a.activeCancel != nil {
		a.activeCancel()
	}
	a.lifecycleMu.Unlock()
	a.mcpClient.Close()
	a.apiClient.Close()
}

// spawnSubagent creates a child agent and runs a prompt synchronously.
func (a *Agent) spawnSubagent(ctx context.Context, config tools.SubagentConfig) (string, error) {
	model := config.Model
	if model == "" {
		model = a.opts.Model
	}

	childOpts := Options{
		HTTPClient:         a.opts.HTTPClient,
		Model:              model,
		APIKey:             a.opts.APIKey,
		BaseURL:            a.opts.BaseURL,
		Provider:           a.opts.Provider,
		Env:                a.opts.Env,
		Isolation:          a.opts.Isolation,
		AllowedTools:       a.opts.AllowedTools,
		DisallowedTools:    a.opts.DisallowedTools,
		MCPServers:         a.opts.MCPServers,
		RequireMCPServers:  a.opts.RequireMCPServers,
		MaxConcurrentTools: a.opts.MaxConcurrentTools,
		MaxContextBytes:    a.opts.MaxContextBytes,
		CWD:                config.CWD,
		MaxTurns:           30,
		PermissionMode:     a.opts.PermissionMode,
		SystemPrompt:       config.SystemPrompt,
		CustomHeaders:      a.opts.CustomHeaders,
		ProxyURL:           a.opts.ProxyURL,
		TimeoutMs:          a.opts.TimeoutMs,
	}

	if childOpts.CWD == "" {
		childOpts.CWD = a.opts.CWD
	}

	// Use parent's permission callback if available
	if a.opts.CanUseTool != nil {
		childOpts.CanUseTool = a.opts.CanUseTool
	} else {
		childOpts.PermissionMode = a.opts.PermissionMode
	}

	child := New(childOpts)
	defer child.Close()

	if err := child.Init(ctx); err != nil {
		return "", fmt.Errorf("subagent init failed: %w", err)
	}
	if len(config.Tools) > 0 {
		// Restrict the actual catalog as well as the prompt. Parent allow/deny
		// rules still apply in the child's loop, so definitions cannot widen it.
		registry := tools.NewRegistry()
		for _, name := range config.Tools {
			if tool := child.toolRegistry.Get(name); tool != nil {
				registry.Register(tool)
			}
		}
		child.toolRegistry = registry
	}

	result, err := child.Prompt(ctx, config.Prompt)
	if err != nil {
		return "", err
	}

	// Merge cost into parent tracker
	if child.costTracker != nil && a.costTracker != nil {
		childIn, childOut := child.costTracker.TotalTokens()
		a.costTracker.AddUsage(model, &types.Usage{
			InputTokens:  childIn,
			OutputTokens: childOut,
		})
	}

	return result.Text, nil
}

// SessionID returns the current session ID.
func (a *Agent) SessionID() string {
	return a.sessionID
}

// CostTracker returns the cost tracker.
func (a *Agent) CostTracker() *costtracker.Tracker {
	return a.costTracker
}

// MCPClient returns the MCP client for managing MCP server connections.
func (a *Agent) MCPClient() *mcp.Client {
	return a.mcpClient
}

// envFirst returns the first non-empty value from the explicit environment and,
// when allowed, the process environment.
func envFirst(env map[string]string, allowProcessEnv bool, keys ...string) string {
	for _, key := range keys {
		if env != nil {
			if v := env[key]; v != "" {
				return v
			}
		}
		if allowProcessEnv {
			if v := os.Getenv(key); v != "" {
				return v
			}
		}
	}
	return ""
}

func resolveEnvOptions(opts *Options) {
	env := opts.Env
	allowProcessEnv := opts.Isolation == nil || opts.Isolation.AllowProcessEnv

	if opts.APIKey == "" {
		opts.APIKey = envFirst(env, allowProcessEnv, "CODEANY_API_KEY", "ANTHROPIC_API_KEY", "CODEANY_AUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN")
	}

	if opts.BaseURL == "" {
		opts.BaseURL = envFirst(env, allowProcessEnv, "CODEANY_BASE_URL", "ANTHROPIC_BASE_URL")
	}

	if opts.Model == "" {
		opts.Model = envFirst(env, allowProcessEnv, "CODEANY_MODEL", "ANTHROPIC_MODEL")
		if opts.Model == "" {
			opts.Model = "sonnet-4-6"
		}
	}

	if opts.CWD == "" {
		opts.CWD, _ = os.Getwd()
	}

	if opts.MaxTurns == 0 {
		opts.MaxTurns = defaultMaxTurns
	}
}
