package service

import "testing"

func TestProjectWorkflowTransitions(t *testing.T) {
	states := []string{"planned", "in_progress", "in_review", "completed", "cancelled", "future_state"}
	actions := []string{"edit", "assign", "submit", "approve", "reject", "retry", "future_action"}
	allowed := map[string]string{"planned/edit": "planned", "planned/assign": "in_progress", "in_progress/submit": "in_review", "in_progress/retry": "in_progress", "in_review/approve": "completed", "in_review/reject": "in_progress"}
	for _, state := range states {
		for _, action := range actions {
			next, err := ProjectWorkflowTransition(state, action)
			want, ok := allowed[state+"/"+action]
			if ok && (err != nil || next != want) {
				t.Errorf("%s/%s: got %q %v; want %q", state, action, next, err, want)
			}
			if !ok && err == nil {
				t.Errorf("%s/%s unexpectedly allowed", state, action)
			}
		}
	}
}

func TestProjectWorkflowExecutionDoesNotAcceptProject(t *testing.T) {
	for _, status := range []string{"done", "in_review"} {
		if got := ProjectWorkflowState("in_progress", status); got != "in_review" {
			t.Fatalf("execution %s should await human acceptance, got %s", status, got)
		}
	}
	for _, status := range []string{"todo", "in_progress", "blocked", "cancelled", "future_state"} {
		if got := ProjectWorkflowState("in_progress", status); got != "in_progress" {
			t.Fatalf("execution %s unexpectedly advanced project to %s", status, got)
		}
	}
	if got := ProjectWorkflowState("completed", "in_progress"); got != "completed" {
		t.Fatalf("accepted snapshot changed: %s", got)
	}
}
