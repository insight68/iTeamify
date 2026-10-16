package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/spf13/cobra"

	"github.com/iteamify-ai/iteamify/server/internal/mcpserver"
)

var mcpCmd = &cobra.Command{
	Use:   "mcp",
	Short: "Run iteamify's task-scoped MCP integration",
}

var mcpServeCmd = &cobra.Command{
	Use:   "serve",
	Short: "Serve iteamify tools over standard input/output",
	Long: "Serve the first-party iteamify MCP tools over stdio. This command is " +
		"started automatically by supported agent runtimes and requires a task-scoped mat_ token.",
	Args: cobra.NoArgs,
	RunE: runMCPServe,
}

func init() {
	mcpCmd.AddCommand(mcpServeCmd)
}

func runMCPServe(cmd *cobra.Command, _ []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	if client.TaskID == "" || client.AgentID == "" {
		return fmt.Errorf("mcp serve is only available inside an iteamify agent task")
	}
	var server *mcp.Server
	if rawAllowlist, configured := os.LookupEnv("ITEAMIFY_MCP_TOOL_ALLOWLIST"); configured {
		server = mcpserver.NewWithToolAllowlist(client, version, strings.Split(rawAllowlist, ","))
	} else {
		server = mcpserver.New(client, version)
	}
	if err := server.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		return fmt.Errorf("serve MCP: %w", err)
	}
	return nil
}
