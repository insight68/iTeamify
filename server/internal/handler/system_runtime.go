package handler

import (
	"context"

	"github.com/iteamify-ai/iteamify/server/internal/managedpolicy"
	"github.com/iteamify-ai/iteamify/server/pkg/agent"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5/pgtype"
)

func isSystemAgentRuntime(runtime db.AgentRuntime) bool {
	return agent.IsSystemRuntimeProvider(runtime.Provider) && !runtime.ProfileID.Valid
}

// isPlatformControlledRuntime separates physical execution ownership from
// workspace content. System OpenAgent rows use the shared daemon's
// strict execution boundary with workspace-owned model configuration.
func isPlatformControlledRuntime(runtime db.AgentRuntime) bool {
	return isSystemAgentRuntime(runtime)
}

func workspacePlatformExecutionPolicyKey(runtime db.AgentRuntime) (string, bool) {
	if isSystemAgentRuntime(runtime) {
		return managedpolicy.ExecutionPolicyWorkspaceOpenAgentV1, true
	}

	return "", false
}

func (h *Handler) runtimeBelongsToManagedDaemon(runtime db.AgentRuntime, daemonID string) bool {
	if !runtime.DaemonID.Valid || runtime.DaemonID.String != daemonID {
		return false
	}
	if isPlatformControlledRuntime(runtime) {
		return true
	}
	return false
}

func (h *Handler) systemRuntimeDaemonID() string {
	if h.cfg.ManagedDaemonID != "" {
		return h.cfg.ManagedDaemonID
	}
	return agent.DefaultSystemRuntimeDaemonID
}

// workspaceModelForRuntime uses the same database-backed configuration consumed
// by the shared daemon. An unconfigured workspace has no model catalog.
func (h *Handler) workspaceModelForRuntime(ctx context.Context, runtime db.AgentRuntime) string {
	if isSystemAgentRuntime(runtime) && h.Queries != nil {
		if row, err := h.Queries.GetWorkspaceOpenAgentConfig(ctx, runtime.WorkspaceID); err == nil {
			return row.Model
		}
	}
	return ""
}

// ensureWorkspaceSystemRuntimes lazily materializes stable workspace-scoped
// handles for code-defined runtimes. The global daemon updates the same row
// when it is available; until then the runtime remains visible as offline.
func (h *Handler) ensureWorkspaceSystemRuntimes(ctx context.Context, workspaceID pgtype.UUID) error {
	return h.Queries.EnsureSystemAgentRuntime(ctx, db.EnsureSystemAgentRuntimeParams{
		WorkspaceID: workspaceID,
		DaemonID:    pgtype.Text{String: h.systemRuntimeDaemonID(), Valid: true},
	})
}
