package api

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/codeany-ai/open-agent-sdk-go/types"
)

const (
	defaultBaseURL   = "https://api.anthropic.com"
	defaultModel     = "sonnet-4-6"
	apiVersion       = "2023-06-01"
	defaultMaxTokens = 16384
	maxRetries       = 3
)

// ModelConfig holds per-model configuration.
type ModelConfig struct {
	MaxOutputTokens int
	ContextWindow   int
}

// Known model configurations.
var modelConfigs = map[string]ModelConfig{
	"opus-4-6":   {MaxOutputTokens: 32768, ContextWindow: 1048576},
	"sonnet-4-6": {MaxOutputTokens: 16384, ContextWindow: 200000},
	"haiku-4-5":  {MaxOutputTokens: 8192, ContextWindow: 200000},
	"sonnet-4-5": {MaxOutputTokens: 16384, ContextWindow: 200000},
}

// GetModelConfig returns configuration for a model.
func GetModelConfig(model string) ModelConfig {
	if cfg, ok := modelConfigs[model]; ok {
		return cfg
	}
	return ModelConfig{MaxOutputTokens: defaultMaxTokens, ContextWindow: 200000}
}

// Provider identifies the API format to use.
type Provider string

const (
	ProviderAnthropic Provider = "anthropic"
	ProviderOpenAI    Provider = "openai"
)

// ClientConfig configures the API client.
type ClientConfig struct {
	APIKey        string
	BaseURL       string
	Model         string
	MaxTokens     int
	Provider      Provider // "anthropic" or "openai" (auto-detected if empty)
	HTTPClient    *http.Client
	CustomHeaders map[string]string
	ProxyURL      string
	TimeoutMs     int

	// DisallowProcessEnv prevents ambient credentials, headers, proxy and timeout inheritance.
	DisallowProcessEnv bool
	// MaxRequestBytes bounds the serialized context, including tools and system prompt.
	MaxRequestBytes int
}

// Client communicates with the Messages API.
type Client struct {
	config         ClientConfig
	ownedTransport *http.Transport
}

// envOr returns the first non-empty value from environment variables,
// trying CODEANY_ prefix first then ANTHROPIC_ for compatibility.
func envOr(keys ...string) string {
	for _, key := range keys {
		if v := os.Getenv(key); v != "" {
			return v
		}
	}
	return ""
}

// NewClient creates an API client.
func NewClient(config ClientConfig) *Client {
	envValue := func(keys ...string) string {
		if config.DisallowProcessEnv {
			return ""
		}
		return envOr(keys...)
	}
	if config.APIKey == "" {
		config.APIKey = envValue("CODEANY_API_KEY", "ANTHROPIC_API_KEY")
	}
	if config.BaseURL == "" {
		config.BaseURL = envValue("CODEANY_BASE_URL", "ANTHROPIC_BASE_URL")
		if config.BaseURL == "" {
			config.BaseURL = defaultBaseURL
		}
	}
	if config.Model == "" {
		config.Model = envValue("CODEANY_MODEL", "ANTHROPIC_MODEL")
		if config.Model == "" {
			config.Model = defaultModel
		}
	}
	if config.MaxTokens == 0 {
		cfg := GetModelConfig(config.Model)
		config.MaxTokens = cfg.MaxOutputTokens
	}

	if config.MaxRequestBytes <= 0 {
		config.MaxRequestBytes = defaultMaxRequestBytes
	}

	// Auto-detect provider if not set
	if config.Provider == "" {
		config.Provider = detectProvider(config.BaseURL, config.APIKey, config.Model)
	}

	// Parse custom headers from env
	headers := make(map[string]string, len(config.CustomHeaders))
	for key, value := range config.CustomHeaders {
		headers[key] = value
	}
	config.CustomHeaders = headers
	if envHeaders := envValue("CODEANY_CUSTOM_HEADERS", "ANTHROPIC_CUSTOM_HEADERS"); envHeaders != "" {
		for _, pair := range strings.Split(envHeaders, ",") {
			parts := strings.SplitN(strings.TrimSpace(pair), ":", 2)
			if len(parts) == 2 {
				config.CustomHeaders[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
			}
		}
	}

	// Build HTTP client
	timeout := 10 * time.Minute
	if config.TimeoutMs > 0 {
		timeout = time.Duration(config.TimeoutMs) * time.Millisecond
	} else if envTimeout := envValue("API_TIMEOUT_MS"); envTimeout != "" {
		var ms int
		fmt.Sscanf(envTimeout, "%d", &ms)
		if ms > 0 {
			timeout = time.Duration(ms) * time.Millisecond
		}
	}

	var ownedTransport *http.Transport
	if config.HTTPClient == nil {
		transport := sharedTransport
		if config.DisallowProcessEnv {
			transport = isolatedTransport
		}
		if config.ProxyURL != "" {
			if u, err := url.Parse(config.ProxyURL); err == nil {
				transport = transport.Clone()
				transport.Proxy = http.ProxyURL(u)
				ownedTransport = transport
			}
		}
		config.HTTPClient = &http.Client{Timeout: timeout, Transport: transport}
	}
	return &Client{config: config, ownedTransport: ownedTransport}
}

// Model returns the current model name.
func (c *Client) Model() string {
	return c.config.Model
}

// SetModel changes the model used for subsequent requests.
func (c *Client) SetModel(model string) {
	c.config.Model = model
	cfg := GetModelConfig(model)
	c.config.MaxTokens = cfg.MaxOutputTokens
}

// APIMessage is a message sent to the API.
type APIMessage struct {
	Role    string               `json:"role"`
	Content []types.ContentBlock `json:"content"`
}

// APIToolParam is a tool definition for the API.
type APIToolParam struct {
	Name         string                 `json:"name"`
	Description  string                 `json:"description"`
	InputSchema  map[string]interface{} `json:"input_schema"`
	CacheControl *CacheControl          `json:"cache_control,omitempty"`
}

// MessagesRequest is the request body for the Messages API.
type MessagesRequest struct {
	Model         string                 `json:"model"`
	MaxTokens     int                    `json:"max_tokens"`
	System        []SystemBlock          `json:"system,omitempty"`
	Messages      []APIMessage           `json:"messages"`
	Tools         []APIToolParam         `json:"tools,omitempty"`
	Stream        bool                   `json:"stream"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
	StopSequences []string               `json:"stop_sequences,omitempty"`
	Temperature   *float64               `json:"temperature,omitempty"`
	TopP          *float64               `json:"top_p,omitempty"`

	// Extended thinking
	Thinking *ThinkingConfig `json:"thinking,omitempty"`

	// Structured output
	ToolChoice interface{} `json:"tool_choice,omitempty"`
}

// SystemBlock is a system prompt block.
type SystemBlock struct {
	Type         string        `json:"type"`
	Text         string        `json:"text"`
	CacheControl *CacheControl `json:"cache_control,omitempty"`
}

// CacheControl configures prompt caching.
type CacheControl struct {
	Type string `json:"type"` // "ephemeral"
}

// ThinkingConfig configures extended thinking.
type ThinkingConfig struct {
	Type         string `json:"type"`          // "enabled"
	BudgetTokens int    `json:"budget_tokens"` // Max thinking tokens
}

// StreamEvent represents a server-sent event from the streaming API.
type StreamEvent struct {
	Type string `json:"type"`

	// message_start
	Message *StreamMessage `json:"message,omitempty"`

	// content_block_start, content_block_delta
	Index        int                    `json:"index,omitempty"`
	ContentBlock *types.ContentBlock    `json:"content_block,omitempty"`
	Delta        map[string]interface{} `json:"delta,omitempty"`

	// message_delta
	Usage *types.Usage `json:"usage,omitempty"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// StreamMessage is the message object in a message_start event.
type StreamMessage struct {
	ID         string               `json:"id"`
	Type       string               `json:"type"`
	Role       string               `json:"role"`
	Content    []types.ContentBlock `json:"content"`
	Model      string               `json:"model"`
	StopReason string               `json:"stop_reason"`
	Usage      *types.Usage         `json:"usage"`
}

// StreamCallback is called for each streaming event.
type StreamCallback func(event StreamEvent) error

// buildBetaHeaders returns the appropriate beta headers based on the request.
func (c *Client) buildBetaHeaders(req MessagesRequest) string {
	var betas []string
	betas = append(betas, "prompt-caching-2024-07-31")

	if req.Thinking != nil && req.Thinking.Type == "enabled" {
		betas = append(betas, "interleaved-thinking-2025-05-14")
	}

	// Check model context window for 1M beta
	cfg := GetModelConfig(req.Model)
	if cfg.ContextWindow >= 1000000 {
		betas = append(betas, "context-1m-20250901")
	}

	return strings.Join(betas, ",")
}

// detectProvider auto-detects the API provider from URL, key, and model.
func detectProvider(baseURL, apiKey, model string) Provider {
	u := strings.ToLower(baseURL)

	// Explicit OpenAI-compatible endpoints
	if strings.Contains(u, "openai.com") ||
		strings.Contains(u, "openrouter.ai") ||
		strings.Contains(u, "deepseek.com") ||
		strings.Contains(u, "together.ai") ||
		strings.Contains(u, "groq.com") ||
		strings.Contains(u, "fireworks.ai") ||
		strings.Contains(u, "ollama") ||
		strings.Contains(u, "localhost") ||
		strings.Contains(u, "127.0.0.1") ||
		strings.Contains(u, "vllm") ||
		strings.Contains(u, "lmstudio") {
		return ProviderOpenAI
	}

	// Key prefix detection
	if strings.HasPrefix(apiKey, "sk-or-") { // OpenRouter
		return ProviderOpenAI
	}
	if strings.HasPrefix(apiKey, "sk-") && !strings.HasPrefix(apiKey, "sk-ant-") {
		return ProviderOpenAI
	}

	// Model name detection
	m := strings.ToLower(model)
	if strings.HasPrefix(m, "gpt-") ||
		strings.HasPrefix(m, "o1") ||
		strings.HasPrefix(m, "o3") ||
		strings.HasPrefix(m, "deepseek") ||
		strings.HasPrefix(m, "llama") ||
		strings.HasPrefix(m, "mistral") ||
		strings.HasPrefix(m, "qwen") ||
		strings.HasPrefix(m, "gemma") ||
		strings.HasPrefix(m, "phi") ||
		strings.Contains(m, "/") { // OpenRouter format: provider/model
		return ProviderOpenAI
	}

	return ProviderAnthropic
}

// IsOpenAI returns true if this client uses the OpenAI API format.
func (c *Client) IsOpenAI() bool {
	return c.config.Provider == ProviderOpenAI
}

// CreateMessageStream sends a streaming messages request.
func (c *Client) CreateMessageStream(ctx context.Context, req MessagesRequest) (<-chan StreamEvent, <-chan error) {
	eventCh := make(chan StreamEvent, 64)
	errCh := make(chan error, 1)

	go func() {
		defer close(eventCh)
		defer close(errCh)
		defer func() {
			if recovered := recover(); recovered != nil {
				errCh <- fmt.Errorf("API stream panic: %v", recovered)
			}
		}()

		req.Stream = true
		if req.Model == "" {
			req.Model = c.config.Model
		}
		if req.MaxTokens == 0 {
			req.MaxTokens = c.config.MaxTokens
		}

		// Route to OpenAI adapter if needed
		if c.config.Provider == ProviderOpenAI {
			if err := c.createOpenAIStream(ctx, req, eventCh); err != nil {
				errCh <- fmt.Errorf("API stream error: %w", err)
			}
			return
		}

		body, err := c.marshalRequest(req)
		if err != nil {
			errCh <- fmt.Errorf("marshal request: %w", err)
			return
		}

		headers := http.Header{}
		headers.Set("X-API-Key", c.config.APIKey)
		headers.Set("Anthropic-Version", apiVersion)
		headers.Set("Anthropic-Beta", c.buildBetaHeaders(req))
		headers.Set("Accept", "text/event-stream")
		resp, err := c.doRequest(ctx, "/v1/messages", body, headers)
		if err != nil {
			errCh <- err
			return
		}

		defer resp.Body.Close()
		stopClose := context.AfterFunc(ctx, func() { _ = resp.Body.Close() })
		defer stopClose()

		if resp.StatusCode != http.StatusOK {
			bodyBytes, _ := readBoundedResponse(resp.Body, maxErrorResponseBytes)
			errCh <- &HTTPError{StatusCode: resp.StatusCode, Message: string(bodyBytes)}
			return
		}

		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

		for scanner.Scan() {
			line := scanner.Text()

			if !strings.HasPrefix(line, "data: ") {
				continue
			}

			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				errCh <- fmt.Errorf("API stream ended before message_stop")
				return
			}

			var event StreamEvent
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				errCh <- fmt.Errorf("invalid API stream event: %w", err)
				return
			}
			if event.Type == "error" {
				if event.Error == nil {
					errCh <- fmt.Errorf("API stream error without details")
				} else {
					errCh <- fmt.Errorf("API stream error (%s): %s", event.Error.Type, event.Error.Message)
				}
				return
			}

			select {
			case eventCh <- event:
			case <-ctx.Done():
				errCh <- ctx.Err()
				return
			}
			if event.Type == "message_stop" {
				return
			}
		}

		if err := scanner.Err(); err != nil {
			errCh <- fmt.Errorf("read stream: %w", err)
		} else if ctx.Err() != nil {
			errCh <- ctx.Err()
		} else {
			errCh <- fmt.Errorf("API stream ended before message_stop")
		}
	}()

	return eventCh, errCh
}

// CreateMessage sends a non-streaming messages request.
func (c *Client) CreateMessage(ctx context.Context, req MessagesRequest) (*StreamMessage, error) {
	req.Stream = false
	if req.Model == "" {
		req.Model = c.config.Model
	}
	if req.MaxTokens == 0 {
		req.MaxTokens = c.config.MaxTokens
	}

	// Route to OpenAI adapter if needed
	if c.config.Provider == ProviderOpenAI {
		return c.createOpenAIMessage(ctx, req)
	}

	body, err := c.marshalRequest(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	headers := http.Header{}
	headers.Set("X-API-Key", c.config.APIKey)
	headers.Set("Anthropic-Version", apiVersion)
	headers.Set("Anthropic-Beta", c.buildBetaHeaders(req))
	resp, err := c.doRequest(ctx, "/v1/messages", body, headers)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := readBoundedResponse(resp.Body, maxResponseBytes)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, &HTTPError{StatusCode: resp.StatusCode, Message: string(bodyBytes)}
	}

	var msg StreamMessage
	if err := json.Unmarshal(bodyBytes, &msg); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	return &msg, nil
}

// isRetryableError checks if an error is transient and retryable.
func isRetryableError(err error) bool {
	s := err.Error()
	return strings.Contains(s, "EOF") ||
		strings.Contains(s, "connection reset") ||
		strings.Contains(s, "connection refused") ||
		strings.Contains(s, "TLS handshake timeout") ||
		strings.Contains(s, "broken pipe") ||
		strings.Contains(s, "i/o timeout")
}

// ToolToAPIParam converts a Tool to an API tool parameter.
func ToolToAPIParam(t types.Tool) APIToolParam {
	schema := t.InputSchema()
	schemaMap := map[string]interface{}{
		"type": schema.Type,
	}
	if schema.Properties != nil {
		schemaMap["properties"] = schema.Properties
	}
	if schema.Required != nil {
		schemaMap["required"] = schema.Required
	}

	return APIToolParam{
		Name:        t.Name(),
		Description: t.Description(),
		InputSchema: schemaMap,
	}
}

// ToolToAPIParamWithCache creates a tool parameter with cache control.
func ToolToAPIParamWithCache(t types.Tool) APIToolParam {
	param := ToolToAPIParam(t)
	param.CacheControl = &CacheControl{Type: "ephemeral"}
	return param
}
