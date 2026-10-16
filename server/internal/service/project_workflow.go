package service

import "errors"

var ErrProjectWorkflowTransition = errors.New("project workflow action is not allowed in this state")

// ProjectWorkflowState keeps execution completion separate from human acceptance.
func ProjectWorkflowState(state, issueStatus string) string {
	if state == "in_progress" && (issueStatus == "done" || issueStatus == "in_review") {
		return "in_review"
	}
	return state
}

func ProjectWorkflowTransition(state, action string) (string, error) {
	switch {
	case action == "edit" && state == "planned":
		return state, nil
	case action == "assign" && state == "planned":
		return "in_progress", nil
	case action == "submit" && state == "in_progress":
		return "in_review", nil
	case action == "approve" && state == "in_review":
		return "completed", nil
	case action == "reject" && state == "in_review":
		return "in_progress", nil
	case action == "retry" && state == "in_progress":
		return state, nil
	default:
		return "", ErrProjectWorkflowTransition
	}
}
