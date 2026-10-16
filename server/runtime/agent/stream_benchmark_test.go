package agent

import (
	"strings"
	"testing"

	"github.com/codeany-ai/open-agent-sdk-go/api"
	"github.com/codeany-ai/open-agent-sdk-go/types"
)

func BenchmarkStreamAssembly(b *testing.B) {
	a := New(Options{Isolation: &IsolationPolicy{}})
	defer a.Close()
	delta := api.StreamEvent{Type: "content_block_delta", Index: 0, Delta: map[string]interface{}{"type": "text_delta", "text": strings.Repeat("x", 32)}}
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		msg := &types.Message{}
		assembler := &streamAssembler{}
		if err := assembler.processEvent(api.StreamEvent{Type: "content_block_start", ContentBlock: &types.ContentBlock{Type: types.ContentBlockText}}, msg, new([]types.ToolUseBlock)); err != nil {
			b.Fatal(err)
		}
		for j := 0; j < 4096; j++ {
			if err := assembler.processEvent(delta, msg, new([]types.ToolUseBlock)); err != nil {
				b.Fatal(err)
			}
		}
		assembler.finish(msg)
		if len(msg.Content[0].Text) != 4096*32 {
			b.Fatal("incomplete stream")
		}
	}
}
