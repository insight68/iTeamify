package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/codeany-ai/open-agent-sdk-go/api"
	agentcontext "github.com/codeany-ai/open-agent-sdk-go/context"
	"github.com/codeany-ai/open-agent-sdk-go/tools"
	"github.com/codeany-ai/open-agent-sdk-go/types"
)

const defaultSystemPrompt = `You are an AI assistant with access to tools. Use the tools available to you to help the user with their request. Be concise and direct in your responses.`

// runLoop is the main agentic loop.
func (a *Agent) runLoop(ctx context.Context, prompt string, eventCh chan<- types.SDKMessage, state *queryState) error {

	// Build system prompt
	systemPrompt := a.opts.SystemPrompt
	if systemPrompt == "" {
		systemPrompt = defaultSystemPrompt
	}
	if a.opts.AppendSystemPrompt != "" {
		systemPrompt += "\n\n" + a.opts.AppendSystemPrompt
	}

	// Host context is useful for standalone coding Agents but is ambient state
	// in a shared daemon. Managed callers explicitly disable it and provide the
	// complete task brief through SystemPrompt instead.
	var sysCtx *agentcontext.SystemContext
	var userCtx *agentcontext.UserContext
	if a.opts.Isolation == nil || a.opts.Isolation.AllowHostContext {
		sysCtx = agentcontext.GetSystemContext(a.opts.CWD)
		userCtx = agentcontext.GetUserContext(a.opts.CWD)
	}
	systemBlocks := agentcontext.BuildSystemPromptBlocks(systemPrompt, sysCtx, userCtx)

	// Convert system blocks to API format
	apiSystemBlocks := make([]api.SystemBlock, len(systemBlocks))
	for i, b := range systemBlocks {
		block := api.SystemBlock{
			Type: "text",
			Text: b["text"].(string),
		}
		if cc, ok := b["cache_control"]; ok {
			if ccMap, ok := cc.(map[string]string); ok {
				block.CacheControl = &api.CacheControl{Type: ccMap["type"]}
			}
		}
		apiSystemBlocks[i] = block
	}
	// Cache the caller-owned prompt too, including in MCP-only runtimes that
	// have no ambient host context. Existing host blocks keep their own markers.
	if len(apiSystemBlocks) > 0 {
		apiSystemBlocks[0].CacheControl = &api.CacheControl{Type: "ephemeral"}
	}

	// Add user message
	userMsg := types.Message{
		Type: types.MessageTypeUser,
		Role: "user",
		Content: []types.ContentBlock{{
			Type: types.ContentBlockText,
			Text: prompt,
		}},
		UUID:      uuid.New().String(),
		Timestamp: time.Now(),
	}
	a.appendMessage(userMsg)

	// Build tool params - filter by allowedTools and disallowedTools
	allTools := a.toolRegistry.All()
	if len(a.opts.AllowedTools) > 0 {
		allowedSet := make(map[string]bool, len(a.opts.AllowedTools))
		for _, name := range a.opts.AllowedTools {
			allowedSet[name] = true
		}
		var filtered []types.Tool
		for _, t := range allTools {
			if allowedSet[t.Name()] {
				filtered = append(filtered, t)
			}
		}
		allTools = filtered
	}
	if len(a.opts.DisallowedTools) > 0 {
		disallowedSet := make(map[string]bool, len(a.opts.DisallowedTools))
		for _, name := range a.opts.DisallowedTools {
			disallowedSet[name] = true
		}
		var filtered []types.Tool
		for _, t := range allTools {
			if !disallowedSet[t.Name()] {
				filtered = append(filtered, t)
			}
		}
		allTools = filtered
	}
	apiTools := make([]api.APIToolParam, len(allTools))
	for i, t := range allTools {
		apiTools[i] = api.ToolToAPIParam(t)
	}
	if len(apiTools) > 0 {
		apiTools[len(apiTools)-1].CacheControl = &api.CacheControl{Type: "ephemeral"}
	}

	// Create tool context
	toolCtx := &types.ToolUseContext{
		WorkingDir:    a.opts.CWD,
		AbortCtx:      ctx,
		ReadFileState: make(map[string]*types.FileReadState),
	}

	// Create tool executor
	executionRegistry := tools.NewRegistry()
	for _, tool := range allTools {
		executionRegistry.Register(tool)
	}
	executor := tools.NewExecutor(executionRegistry, a.canUseTool, toolCtx)
	executor.MaxConcurrency = a.opts.MaxConcurrentTools

	// Main loop
	for state.turns < a.opts.MaxTurns {
		if err := ctx.Err(); err != nil {
			return err
		}

		// The budget is checked before starting another model request.
		if a.opts.MaxBudgetUSD > 0 && a.costTracker.TotalCost() >= a.opts.MaxBudgetUSD {
			state.stopReason = "budget_exceeded"
			return fmt.Errorf("budget limit reached ($%.2f)", a.opts.MaxBudgetUSD)
		}
		state.turns++

		// Build API messages from conversation history
		apiMessages := a.buildAPIMessages()

		// Call the API
		req := api.MessagesRequest{
			System:   apiSystemBlocks,
			Messages: apiMessages,
			Tools:    apiTools,
		}

		// Extended thinking - explicit config takes precedence, then effort-based auto-config
		if a.opts.Thinking != nil {
			switch a.opts.Thinking.Type {
			case ThinkingEnabled:
				req.Thinking = &api.ThinkingConfig{
					Type:         "enabled",
					BudgetTokens: a.opts.Thinking.BudgetTokens,
				}
			case ThinkingAdaptive:
				req.Thinking = &api.ThinkingConfig{
					Type: "adaptive",
				}
			case ThinkingDisabled:
				// No thinking config needed
			}
		} else if a.opts.Effort != "" {
			switch a.opts.Effort {
			case EffortLow:
				// Disabled - no thinking config
			case EffortMedium:
				req.Thinking = &api.ThinkingConfig{
					Type: "adaptive",
				}
			case EffortHigh:
				req.Thinking = &api.ThinkingConfig{
					Type:         "enabled",
					BudgetTokens: 10000,
				}
			case EffortMax:
				req.Thinking = &api.ThinkingConfig{
					Type:         "enabled",
					BudgetTokens: 50000,
				}
			}
		}

		// Structured output (JSON schema)
		if a.opts.JSONSchema != nil {
			req.ToolChoice = map[string]interface{}{
				"type": "any",
			}
		}

		assistantMsg, toolUseBlocks, streamError := a.readStream(ctx, req, eventCh, state)
		// A fallback may only replace a response that emitted no content. Once
		// text or tool arguments are visible, replacing it would duplicate output.
		if streamError != nil && !errors.Is(streamError, api.ErrRequestTooLarge) && len(assistantMsg.Content) == 0 && ctx.Err() == nil &&
			a.opts.FallbackModel != "" && a.apiClient.Model() != a.opts.FallbackModel {
			a.apiClient.SetModel(a.opts.FallbackModel)
			assistantMsg, toolUseBlocks, streamError = a.readStream(ctx, req, eventCh, state)
		}
		if streamError != nil {
			if errors.Is(streamError, api.ErrRequestTooLarge) {
				state.stopReason = "context_limit"
			}
			return fmt.Errorf("API stream error: %w", streamError)
		}

		if assistantMsg.StopReason == "max_tokens" {
			state.stopReason = "max_tokens"
			return fmt.Errorf("model output token limit reached")
		}
		if len(toolUseBlocks) == 0 {
			if assistantMsg.StopReason != "end_turn" && assistantMsg.StopReason != "stop_sequence" {
				return fmt.Errorf("model returned no tools with stop reason %q", assistantMsg.StopReason)
			}
		} else if assistantMsg.StopReason != "tool_use" {
			return fmt.Errorf("model returned tools with stop reason %q", assistantMsg.StopReason)
		}
		eventMessage := cloneMessages([]types.Message{*assistantMsg})[0]
		if err := sendSDKMessage(ctx, eventCh, types.SDKMessage{Type: types.MessageTypeAssistant, Message: &eventMessage}); err != nil {
			return err
		}
		a.appendMessage(*assistantMsg)
		if len(toolUseBlocks) == 0 {
			if err := a.checkpoint(); err != nil {
				state.stopReason = "checkpoint_error"
				return err
			}
			state.stopReason = assistantMsg.StopReason
			return nil
		}
		// Execute tools
		toolCalls := make([]tools.ToolCallRequest, len(toolUseBlocks))
		for i, tb := range toolUseBlocks {
			toolCalls[i] = tools.ToolCallRequest{
				ToolUseID: tb.ID,
				ToolName:  tb.Name,
				Input:     tb.Input,
			}
		}

		results := executor.RunTools(ctx, toolCalls)

		// Build tool result message
		var toolResultContent []types.ContentBlock
		for _, result := range results {
			content := result.Result.Content
			if len(content) == 0 {
				text := "(no output)"
				if result.Result.Error != "" {
					text = result.Result.Error
				}
				content = []types.ContentBlock{{
					Type: types.ContentBlockText,
					Text: text,
				}}
			}

			toolResultContent = append(toolResultContent, types.ContentBlock{
				Type:      types.ContentBlockToolResult,
				ToolUseID: result.ToolUseID,
				Content:   content,
				IsError:   result.Result.IsError,
			})
		}

		toolResultMsg := types.Message{
			Type:      types.MessageTypeUser,
			Role:      "user",
			Content:   toolResultContent,
			UUID:      uuid.New().String(),
			Timestamp: time.Now(),
		}
		a.appendMessage(toolResultMsg)

		checkpointErr := a.checkpoint()
		var deliveryErr error
		for _, block := range toolResultContent {
			if err := sendSDKMessage(ctx, eventCh, types.SDKMessage{
				Type: "tool_result", Message: &types.Message{Type: "tool_result", Role: "tool", Content: []types.ContentBlock{block}},
			}); err != nil {
				deliveryErr = err
				break
			}
		}
		if checkpointErr != nil {
			state.stopReason = "checkpoint_error"
			return checkpointErr
		}
		if deliveryErr != nil {
			return deliveryErr
		}
	}
	state.stopReason = "max_turns"
	return fmt.Errorf("maximum agent turns reached (%d)", a.opts.MaxTurns)
}

func (a *Agent) checkpoint() error {
	if a.opts.OnCheckpoint != nil {
		return a.opts.OnCheckpoint(a.sessionID, a.GetMessages())
	}
	return nil
}

// readStream drains all buffered events before reading the separate error
// receipt. Accounting also runs on an interrupted stream or parser panic.
func (a *Agent) readStream(ctx context.Context, req api.MessagesRequest, eventCh chan<- types.SDKMessage, state *queryState) (*types.Message, []types.ToolUseBlock, error) {
	streamCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	assembler := &streamAssembler{}
	msg := &types.Message{Type: types.MessageTypeAssistant, Role: "assistant", UUID: uuid.New().String(), Timestamp: time.Now()}
	defer func() {
		assembler.finish(msg)
		if msg.Usage != nil {
			state.usage.InputTokens += msg.Usage.InputTokens
			state.usage.OutputTokens += msg.Usage.OutputTokens
			state.usage.CacheReadInputTokens += msg.Usage.CacheReadInputTokens
			state.usage.CacheCreationInputTokens += msg.Usage.CacheCreationInputTokens
			model := msg.Model
			if model == "" {
				model = a.apiClient.Model()
			}
			u := state.usageByModel[model]
			u.InputTokens += msg.Usage.InputTokens
			u.OutputTokens += msg.Usage.OutputTokens
			u.CacheReadInputTokens += msg.Usage.CacheReadInputTokens
			u.CacheCreationInputTokens += msg.Usage.CacheCreationInputTokens
			state.usageByModel[model] = u
			a.costTracker.AddUsage(model, msg.Usage)
		}
		if text := types.ExtractText(msg); text != "" {
			state.lastText = text
		}
	}()
	events, errs := a.apiClient.CreateMessageStream(streamCtx, req)
	var calls []types.ToolUseBlock
	var processingErr error
	for event := range events {
		if processingErr != nil {
			continue
		}
		processingErr = assembler.processEvent(event, msg, &calls)
		if processingErr == nil {
			var delta types.ContentBlock
			if event.Type == "content_block_start" && event.ContentBlock != nil {
				delta = *event.ContentBlock
			} else if event.Type == "content_block_delta" {
				switch event.Delta["type"] {
				case "text_delta":
					delta.Type = types.ContentBlockText
					delta.Text, _ = event.Delta["text"].(string)
				case "thinking_delta":
					delta.Type = types.ContentBlockThinking
					delta.Thinking, _ = event.Delta["thinking"].(string)
				}
			}
			if delta.Text != "" || delta.Thinking != "" {
				processingErr = sendSDKMessage(streamCtx, eventCh, types.SDKMessage{
					Type:    types.MessageTypeAssistantDelta,
					Message: &types.Message{Type: types.MessageTypeAssistantDelta, Role: "assistant", UUID: msg.UUID, Content: []types.ContentBlock{delta}},
				})
			}
		}
		if processingErr != nil {
			cancel()
		}
	}
	streamErr := <-errs
	if processingErr != nil {
		return msg, calls, processingErr
	}
	return msg, calls, streamErr
}

// buildAPIMessages converts internal messages to API format.
// Normalizes content blocks to only include fields required by the API.
func (a *Agent) buildAPIMessages() []api.APIMessage {
	a.historyMu.RLock()
	defer a.historyMu.RUnlock()
	apiMsgs := make([]api.APIMessage, 0, len(a.messages))
	for _, msg := range a.messages {
		normalized := make([]types.ContentBlock, 0, len(msg.Content))
		for _, block := range msg.Content {
			switch block.Type {
			case types.ContentBlockText:
				normalized = append(normalized, types.ContentBlock{
					Type: types.ContentBlockText,
					Text: block.Text,
				})
			case types.ContentBlockToolUse:
				input := block.Input
				if input == nil {
					input = map[string]interface{}{}
				}
				normalized = append(normalized, types.ContentBlock{
					Type:  types.ContentBlockToolUse,
					ID:    block.ID,
					Name:  block.Name,
					Input: input,
				})
			case types.ContentBlockToolResult:
				tb := types.ContentBlock{
					Type:      types.ContentBlockToolResult,
					ToolUseID: block.ToolUseID,
					IsError:   block.IsError,
				}
				// Flatten content to text for the API
				if len(block.Content) > 0 {
					tb.Content = block.Content
				}
				normalized = append(normalized, tb)
			case types.ContentBlockThinking:
				normalized = append(normalized, types.ContentBlock{
					Type:      types.ContentBlockThinking,
					Thinking:  block.Thinking,
					Signature: block.Signature,
				})
			default:
				normalized = append(normalized, block)
			}
		}
		apiMsgs = append(apiMsgs, api.APIMessage{
			Role:    msg.Role,
			Content: normalized,
		})
	}

	return apiMsgs
}

// parseJSON safely parses JSON, handling the streaming accumulation pattern.
func parseJSON(data string, v interface{}) error {
	// The streamed JSON might have been accumulated from partial chunks
	return jsonUnmarshal([]byte(data), v)
}

// jsonUnmarshal is a wrapper for json.Unmarshal to handle edge cases.
func jsonUnmarshal(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}
