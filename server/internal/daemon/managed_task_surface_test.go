package daemon

import "testing"

func TestValidateManagedTaskSurface(t *testing.T) {
	t.Parallel()

	for _, task := range []Task{
		{ID: "unmanaged-issue"},
		{ID: "managed-chat", ManagedRuntime: true, ChatSessionID: "chat-1"},
	} {
		if err := validateManagedTaskSurface(task); err != nil {
			t.Fatalf("task %s unexpectedly rejected: %v", task.ID, err)
		}
	}
	if err := validateManagedTaskSurface(Task{ID: "managed-issue", ManagedRuntime: true, IssueID: "issue-1"}); err == nil {
		t.Fatal("managed issue task must fail closed until it has a native MCP workflow")
	}
	if err := validateManagedTaskSurface(Task{ID: "managed-autopilot", ManagedRuntime: true, AutopilotRunID: "run-1"}); err == nil {
		t.Fatal("managed autopilot task must fail closed until it has a native MCP workflow")
	}
}
