package mcp

import (
	"slices"
	"testing"

	"github.com/codeany-ai/open-agent-sdk-go/types"
)

func TestIsolatedStdioEnvironmentIsExplicitOnly(t *testing.T) {
	t.Setenv("DAEMON_SECRET", "must-not-leak")
	client := NewClientWithOptions(ClientOptions{})
	environment := client.stdioEnvironment(types.MCPServerConfig{
		Env: map[string]string{"ITEAMIFY_TOKEN": "task-token"},
	})

	if !slices.Contains(environment, "ITEAMIFY_TOKEN=task-token") {
		t.Fatalf("task environment missing: %v", environment)
	}
	if slices.Contains(environment, "DAEMON_SECRET=must-not-leak") {
		t.Fatalf("process environment leaked: %v", environment)
	}
}
