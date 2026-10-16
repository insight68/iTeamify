package handler

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/iteamify-ai/iteamify/server/internal/assistantresource"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5"
)

func (h *Handler) validateAssistantSubmissionIntent(w http.ResponseWriter, r *http.Request, p resolvedAssistantPrincipal, in assistantresource.ActionRequest) bool {
	if in.UserIntentSubmissionID == "" {
		return true
	}
	id, ok := parseUUIDOrBadRequest(w, in.UserIntentSubmissionID, "user_intent_submission_id")
	if !ok {
		return false
	}
	submission, err := h.Queries.GetContractSubmission(r.Context(), db.GetContractSubmissionParams{ID: id, WorkspaceID: p.WorkspaceUUID})
	if err != nil || in.UserIntentMessageID != "" || in.Resource != "contract_review" || in.ResourceID != uuidToString(submission.ReviewID) || submission.ReviewID != p.ChatSessionUUID || submission.TaskID != p.InputTaskUUID || submission.SubmittedBy != p.OriginatorUserUUID {
		writeError(w, 403, "submission intent is not valid for this task and resource")
		return false
	}
	latest, err := h.Queries.GetLatestContractTask(r.Context(), db.GetLatestContractTaskParams{WorkspaceID: p.WorkspaceUUID, ReviewID: submission.ReviewID})
	if err != nil || latest.ID != p.TaskUUID {
		writeError(w, 409, "a newer contract submission superseded this task")
		return false
	}
	return true
}

func (h *Handler) loadContractTaskInput(r *http.Request, task db.AgentTaskQueue, resp *AgentTaskResponse) error {
	owner := task.ID
	if task.ChatInputTaskID.Valid {
		owner = task.ChatInputTaskID
	}
	submission, err := h.Queries.GetContractSubmissionByTask(r.Context(), owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if submission.ReviewID != task.ChatSessionID || submission.SubmittedBy != task.OriginatorUserID {
		return fmt.Errorf("invalid contract task input")
	}
	resp.ContractSubmissionID = uuidToString(submission.ID)
	resp.ChatMessage = string(submission.Input)
	return nil
}
