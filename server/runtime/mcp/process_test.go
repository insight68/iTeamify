package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"testing"
	"time"

	"github.com/codeany-ai/open-agent-sdk-go/types"
)

// The test binary acts as an isolated fake MCP executable, never a host CLI.
func TestMCPHelperProcess(t *testing.T) {
	if os.Getenv("OPENAGENT_TEST_MCP_PROCESS") != "1" {
		return
	}
	decoder, encoder := json.NewDecoder(os.Stdin), json.NewEncoder(os.Stdout)
	for {
		var req JSONRPCRequest
		if err := decoder.Decode(&req); err != nil {
			if err == io.EOF {
				os.Exit(0)
			}
			os.Exit(2)
		}
		if req.ID == 0 {
			continue
		}
		if req.Method == "tools/call" {
			time.Sleep(time.Hour)
			os.Exit(3)
		}
		result := map[string]interface{}{}
		if req.Method == "tools/list" {
			result["tools"] = []map[string]interface{}{{"name": "test_tool", "inputSchema": map[string]interface{}{"type": "object"}}}
		}
		if err := encoder.Encode(map[string]interface{}{"jsonrpc": "2.0", "id": req.ID, "result": result}); err != nil {
			os.Exit(4)
		}
	}
}

func TestStdioProcessIsReapedAfterCancelledTool(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	client := NewClientWithOptions(ClientOptions{})
	defer client.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn, err := client.ConnectServer(ctx, "test", types.MCPServerConfig{Command: executable, Args: []string{"-test.run=^TestMCPHelperProcess$"}, Env: map[string]string{"OPENAGENT_TEST_MCP_PROCESS": "1"}})
	if err != nil {
		t.Fatal(err)
	}
	callCtx, cancelCall := context.WithTimeout(ctx, 50*time.Millisecond)
	defer cancelCall()
	_, err = conn.CallTool(callCtx, "test_tool", nil)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("call error=%v", err)
	}
	conn.close()
	if conn.cmd.ProcessState == nil {
		t.Fatalf("child was not reaped: %v", conn.cmd.ProcessState)
	}
}
