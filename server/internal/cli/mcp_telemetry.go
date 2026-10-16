package cli

import "context"

type mcpToolInvocationReport struct {
	InvocationID string `json:"invocation_id"`
	ToolName     string `json:"tool_name"`
	Succeeded    bool   `json:"succeeded"`
	DurationMS   int64  `json:"duration_ms"`
}

// ReportMCPToolInvocation submits only bounded operational metadata. The
// task, Agent, Runtime, and workspace attribution are derived by the server
// from this client's mat_ task identity.
func (c *APIClient) ReportMCPToolInvocation(ctx context.Context, invocationID, toolName string, succeeded bool, durationMS int64) error {
	return c.PostJSON(ctx, "/api/mcp/tool-invocations", mcpToolInvocationReport{
		InvocationID: invocationID,
		ToolName:     toolName,
		Succeeded:    succeeded,
		DurationMS:   durationMS,
	}, nil)
}
