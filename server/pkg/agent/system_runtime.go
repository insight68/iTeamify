package agent

import "strings"

const (
	// OpenAgentProvider is reserved for the SDK runtime embedded in the shared
	// iTeamify daemon. It cannot be used by custom runtime profiles.
	OpenAgentProvider = "openagent"
	// DefaultSystemRuntimeDaemonID gives the shared daemon a stable identity
	// without requiring every deployment to configure an otherwise arbitrary
	// UUID. Operators may still override it with ITEAMIFY_MANAGED_DAEMON_ID.
	DefaultSystemRuntimeDaemonID = "00000000-0000-4000-8000-000000000001"
)

// IsSystemRuntimeProvider identifies code-defined runtimes that are available
// to every workspace as an independent system handle.
func IsSystemRuntimeProvider(provider string) bool {
	return strings.EqualFold(strings.TrimSpace(provider), OpenAgentProvider)
}
