package daemon

import "fmt"

// validateManagedTaskSurface keeps the V1 global-daemon contract honest.
// Its first-party MCP profile exposes business resources, not the host CLI or
// issue/autopilot APIs assumed by the ordinary coding-agent prompts. Until
// those surfaces have native MCP contracts, admitting them would launch an
// Agent that cannot perform the advertised workflow.
func validateManagedTaskSurface(task Task) error {
	if !task.ManagedRuntime || task.ChatSessionID != "" {
		return nil
	}
	return fmt.Errorf("managed runtime V1 supports chat tasks only (task_id=%s)", task.ID)
}
