package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"strings"

	"github.com/iteamify-ai/iteamify/server/internal/mcpserver"

	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
)

const mcpInvocationReportBodyLimit = 8 << 10

type mcpInvocationReportRequest struct {
	InvocationID string `json:"invocation_id"`
	ToolName     string `json:"tool_name"`
	Succeeded    *bool  `json:"succeeded"`
	DurationMS   int64  `json:"duration_ms"`
}

// RecordManagedAgentMCPToolInvocation accepts only a task-token-authenticated
// completion fact. Attribution is reconstructed from server-stamped headers
// and the task graph; unmanaged workspaces intentionally produce no row.
func (h *Handler) RecordManagedAgentMCPToolInvocation(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Actor-Source") != "task_token" {
		writeError(w, http.StatusForbidden, "MCP invocation reports require a task token")
		return
	}
	report, ok := decodeMCPInvocationReport(w, r)
	if !ok {
		return
	}
	if !normalMCPToolExists(report.ToolName) {
		writeError(w, http.StatusBadRequest, "unknown first-party MCP tool")
		return
	}
	invocationID, ok := parseUUIDOrBadRequest(w, report.InvocationID, "invocation_id")
	if !ok {
		return
	}
	taskID, ok := parseUUIDOrBadRequest(w, r.Header.Get("X-Task-ID"), "task_id")
	if !ok {
		return
	}
	agentID, ok := parseUUIDOrBadRequest(w, r.Header.Get("X-Agent-ID"), "agent_id")
	if !ok {
		return
	}
	workspaceID, ok := parseUUIDOrBadRequest(w, r.Header.Get("X-Workspace-ID"), "workspace_id")
	if !ok {
		return
	}
	if _, err := h.Queries.CreateAgentMCPToolInvocation(r.Context(), db.CreateAgentMCPToolInvocationParams{
		ID:          invocationID,
		ToolName:    report.ToolName,
		Succeeded:   *report.Succeeded,
		DurationMs:  report.DurationMS,
		TaskID:      taskID,
		AgentID:     agentID,
		WorkspaceID: workspaceID,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to record MCP invocation")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func decodeMCPInvocationReport(w http.ResponseWriter, r *http.Request) (mcpInvocationReportRequest, bool) {
	var report mcpInvocationReportRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, mcpInvocationReportBodyLimit))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&report); err != nil {
		writeError(w, http.StatusBadRequest, "invalid MCP invocation report")
		return report, false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid MCP invocation report")
		return report, false
	}
	report.InvocationID = strings.TrimSpace(report.InvocationID)
	report.ToolName = strings.TrimSpace(report.ToolName)
	if report.InvocationID == "" || report.ToolName == "" || report.Succeeded == nil || report.DurationMS < 0 || report.DurationMS > 86_400_000 {
		writeError(w, http.StatusBadRequest, "invalid MCP invocation report")
		return report, false
	}
	return report, true
}

func normalMCPToolExists(name string) bool {
	tools, err := mcpserver.Catalog()
	if err != nil {
		return false
	}
	for _, tool := range tools {
		if tool.Name == name {
			return true
		}
	}
	return false
}

// ListPlatformMCPCatalog returns only safe first-party descriptors plus the
// number of active managed profiles referencing each normal Agent tool.

// ListPlatformMCPUsage returns a bounded 7/30/90-day aggregate. Every catalog
// tool is present even when no post-deployment invocation has been observed.
