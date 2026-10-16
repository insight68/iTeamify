package agent

import (
	"testing"

	"github.com/codeany-ai/open-agent-sdk-go/types"
)

func TestIsolatedAgentStartsWithoutHostToolsOrProcessCredentials(t *testing.T) {
	t.Setenv("ANTHROPIC_AUTH_TOKEN", "host-secret")

	a := New(Options{
		CWD:       t.TempDir(),
		Isolation: &IsolationPolicy{},
	})
	t.Cleanup(a.Close)

	if got := a.opts.APIKey; got != "" {
		t.Fatalf("isolated API key inherited from process environment: %q", got)
	}
	if names := a.toolRegistry.Names(); len(names) != 0 {
		t.Fatalf("isolated Agent registered host tools: %v", names)
	}
}

func TestAgentRestoresExternalSessionState(t *testing.T) {
	prior := []types.Message{{
		Type: types.MessageTypeUser,
		Role: "user",
		UUID: "message-1",
		Content: []types.ContentBlock{{
			Type: types.ContentBlockText,
			Text: "prior turn",
		}},
	}}

	a := New(Options{
		CWD:             t.TempDir(),
		Isolation:       &IsolationPolicy{},
		SessionID:       "session-1",
		InitialMessages: prior,
	})
	t.Cleanup(a.Close)

	if got := a.SessionID(); got != "session-1" {
		t.Fatalf("SessionID = %q, want session-1", got)
	}
	if got := a.GetMessages(); len(got) != 1 || types.ExtractText(&got[0]) != "prior turn" {
		t.Fatalf("restored messages = %#v", got)
	}
}
