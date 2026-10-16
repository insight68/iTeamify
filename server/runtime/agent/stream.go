package agent

import (
	"fmt"
	"strings"

	"github.com/codeany-ai/open-agent-sdk-go/api"
	"github.com/codeany-ai/open-agent-sdk-go/types"
)

const maxStreamContentBytes = 8 << 20

type streamBlock struct {
	text, thinking, signature strings.Builder
	closed                    bool
}

// Builders are allocated separately so growing the block slice never copies them.
type streamAssembler struct {
	blocks []*streamBlock
	bytes  int
}

func (s *streamAssembler) reserve(size int) error {
	if size > maxStreamContentBytes-s.bytes {
		return fmt.Errorf("model response exceeds %d bytes", maxStreamContentBytes)
	}
	s.bytes += size
	return nil
}

func (s *streamAssembler) finish(msg *types.Message) {
	for i, buffer := range s.blocks {
		block := &msg.Content[i]
		if block.Type != types.ContentBlockToolUse {
			block.Text = buffer.text.String()
		}
		block.Thinking = buffer.thinking.String()
		block.Signature = buffer.signature.String()
	}
}

func (s *streamAssembler) processEvent(event api.StreamEvent, msg *types.Message, calls *[]types.ToolUseBlock) error {
	switch event.Type {
	case "message_start":
		if event.Message != nil {
			msg.Model = event.Message.Model
			if event.Message.Usage != nil {
				usage := *event.Message.Usage
				msg.Usage = &usage
			}
		}
	case "content_block_start":
		if len(s.blocks) >= 1024 {
			return fmt.Errorf("model response exceeds content block limit")
		}
		if event.Index != len(msg.Content) || event.ContentBlock == nil {
			return fmt.Errorf("invalid content block start index %d", event.Index)
		}
		block := *event.ContentBlock
		if err := s.reserve(len(block.Text) + len(block.Thinking) + len(block.Signature)); err != nil {
			return err
		}
		if block.Type == types.ContentBlockToolUse {
			if len(*calls) >= 128 {
				return fmt.Errorf("model response exceeds tool call limit")
			}
			if block.ID == "" || block.Name == "" {
				return fmt.Errorf("tool call is missing its id or name")
			}
			for _, call := range *calls {
				if call.ID == block.ID {
					return fmt.Errorf("duplicate tool call id %q", block.ID)
				}
			}
			*calls = append(*calls, types.ToolUseBlock{ID: block.ID, Name: block.Name, Input: block.Input})
		}
		buffer := &streamBlock{}
		buffer.text.WriteString(block.Text)
		buffer.thinking.WriteString(block.Thinking)
		buffer.signature.WriteString(block.Signature)
		s.blocks = append(s.blocks, buffer)
		msg.Content = append(msg.Content, block)
	case "content_block_delta":
		if event.Index < 0 || event.Index >= len(s.blocks) || s.blocks[event.Index].closed {
			return fmt.Errorf("invalid content block delta index %d", event.Index)
		}
		if event.Delta == nil {
			return fmt.Errorf("content block delta is missing")
		}
		buffer, block := s.blocks[event.Index], msg.Content[event.Index]
		var value string
		var target *strings.Builder
		kind, _ := event.Delta["type"].(string)
		switch kind {
		case "text_delta":
			if block.Type != types.ContentBlockText {
				return fmt.Errorf("text delta for non-text block")
			}
			value, _ = event.Delta["text"].(string)
			target = &buffer.text
		case "input_json_delta":
			if block.Type != types.ContentBlockToolUse {
				return fmt.Errorf("tool input delta for non-tool block")
			}
			value, _ = event.Delta["partial_json"].(string)
			target = &buffer.text
		case "thinking_delta":
			if block.Type != types.ContentBlockThinking {
				return fmt.Errorf("thinking delta for non-thinking block")
			}
			value, _ = event.Delta["thinking"].(string)
			target = &buffer.thinking
		case "signature_delta":
			if block.Type != types.ContentBlockThinking {
				return fmt.Errorf("signature delta for non-thinking block")
			}
			value, _ = event.Delta["signature"].(string)
			target = &buffer.signature
		default:
			return fmt.Errorf("unsupported content delta %q", kind)
		}
		if err := s.reserve(len(value)); err != nil {
			return err
		}
		target.WriteString(value)
	case "content_block_stop":
		index := event.Index
		if index < 0 || index >= len(s.blocks) || s.blocks[index].closed {
			return fmt.Errorf("invalid content block stop index %d", index)
		}
		s.blocks[index].closed = true
		s.finish(msg)
		block := &msg.Content[index]
		if block.Type == types.ContentBlockToolUse && s.blocks[index].text.Len() > 0 {
			var input map[string]interface{}
			if err := parseJSON(s.blocks[index].text.String(), &input); err != nil {
				return fmt.Errorf("invalid tool input JSON: %w", err)
			}
			if input == nil {
				return fmt.Errorf("tool input must be a JSON object")
			}
			block.Input, block.Text = input, ""
			for i := range *calls {
				if (*calls)[i].ID == block.ID {
					(*calls)[i].Input = input
					break
				}
			}
		}
	case "message_delta":
		if reason, ok := event.Delta["stop_reason"].(string); ok {
			msg.StopReason = reason
		}
		if event.Usage != nil {
			if msg.Usage == nil {
				msg.Usage = &types.Usage{}
			}
			msg.Usage.OutputTokens = event.Usage.OutputTokens
			if event.Usage.InputTokens > 0 {
				msg.Usage.InputTokens = event.Usage.InputTokens
			}
			if event.Usage.CacheReadInputTokens > 0 {
				msg.Usage.CacheReadInputTokens = event.Usage.CacheReadInputTokens
			}
			if event.Usage.CacheCreationInputTokens > 0 {
				msg.Usage.CacheCreationInputTokens = event.Usage.CacheCreationInputTokens
			}
		}
	case "message_stop":
		for _, block := range s.blocks {
			if !block.closed {
				return fmt.Errorf("model stream ended with an unfinished content block")
			}
		}
	}
	return nil
}
