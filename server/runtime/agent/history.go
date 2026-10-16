package agent

import "github.com/codeany-ai/open-agent-sdk-go/types"

// Snapshots own nested content and JSON tool input as well as the outer slice.
func cloneMessages(messages []types.Message) []types.Message {
	copy := append([]types.Message(nil), messages...)
	for i := range copy {
		copy[i].Content = cloneBlocks(copy[i].Content)
		if copy[i].Usage != nil {
			usage := *copy[i].Usage
			copy[i].Usage = &usage
		}
	}
	return copy
}

func cloneBlocks(blocks []types.ContentBlock) []types.ContentBlock {
	copy := append([]types.ContentBlock(nil), blocks...)
	for i := range copy {
		copy[i].Content = cloneBlocks(copy[i].Content)
		if copy[i].Input != nil {
			copy[i].Input = cloneJSON(copy[i].Input).(map[string]interface{})
		}
		if copy[i].Source != nil {
			source := *copy[i].Source
			copy[i].Source = &source
		}
	}
	return copy
}

func cloneJSON(value interface{}) interface{} {
	switch value := value.(type) {
	case map[string]interface{}:
		copy := make(map[string]interface{}, len(value))
		for key, child := range value {
			copy[key] = cloneJSON(child)
		}
		return copy
	case []interface{}:
		copy := make([]interface{}, len(value))
		for i, child := range value {
			copy[i] = cloneJSON(child)
		}
		return copy
	default:
		return value
	}
}
