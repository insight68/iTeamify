package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/iteamify-ai/iteamify/server/internal/service"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/iteamify-ai/iteamify/server/pkg/protocol"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type ProjectWorkflowResponse struct {
	ProjectResponse
	AcceptanceCriteria string `json:"acceptance_criteria"`
	WorkflowStatus     string `json:"workflow_status"`
	Result             string `json:"result"`
	ReviewNote         string `json:"review_note"`
	Version            int32  `json:"version"`
	ExecutionActive    bool   `json:"execution_active"`
	CanManage          bool   `json:"can_manage"`
	CanSubmit          bool   `json:"can_submit"`
	CanReview          bool   `json:"can_review"`
}

func projectWorkflowBase(p db.Project, flow db.ProjectWorkflow, uid pgtype.UUID, role string) ProjectWorkflowResponse {
	resp := ProjectWorkflowResponse{ProjectResponse: projectToResponse(p), AcceptanceCriteria: flow.AcceptanceCriteria, WorkflowStatus: flow.State, Result: flow.Result, ReviewNote: flow.ReviewNote, Version: flow.Version}
	resp.CanManage = uid == flow.CreatedBy || roleAllowed(role, "owner", "admin")
	resp.CanReview = resp.CanManage
	resp.CanSubmit = resp.CanManage || (p.LeadType.String == "member" && p.LeadID == uid)
	return resp
}

func (h *Handler) projectWorkflowResponse(ctx context.Context, p db.Project, flow db.ProjectWorkflow, uid pgtype.UUID, role string) (ProjectWorkflowResponse, error) {
	resp := projectWorkflowBase(p, flow, uid, role)
	if flow.ExecutionIssueID.Valid {
		i, err := h.Queries.GetIssueInWorkspace(ctx, db.GetIssueInWorkspaceParams{ID: flow.ExecutionIssueID, WorkspaceID: p.WorkspaceID})
		if err != nil {
			return resp, err
		}
		active, err := h.Queries.HasProjectExecutionTask(ctx, i.ID)
		if err != nil {
			return resp, err
		}
		resp.ExecutionActive = active
		resp.WorkflowStatus = service.ProjectWorkflowState(flow.State, i.Status)
		if resp.Result == "" && resp.WorkflowStatus == "in_review" {
			result, err := h.Queries.GetProjectWorkflowResult(ctx, db.GetProjectWorkflowResultParams{IssueID: i.ID, WorkspaceID: p.WorkspaceID, Since: flow.UpdatedAt, AuthorID: p.LeadID})
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return resp, err
			}
			resp.Result = result
		}
	}
	return resp, nil
}

func (h *Handler) ListProjectWorkflows(w http.ResponseWriter, r *http.Request) {
	wid, uid, member, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	rows, err := h.Queries.ListProjectWorkflows(r.Context(), wid)
	if err != nil {
		writeError(w, 500, "failed to load projects")
		return
	}
	resp := make([]ProjectWorkflowResponse, 0, len(rows))
	for _, row := range rows {
		item := projectWorkflowBase(row.Project, row.ProjectWorkflow, uid, member.Role)
		item.WorkflowStatus = service.ProjectWorkflowState(row.ProjectWorkflow.State, row.ExecutionStatus)
		resp = append(resp, item)
	}
	writeJSON(w, 200, resp)
}

func (h *Handler) GetProjectWorkflow(w http.ResponseWriter, r *http.Request) {
	wid, uid, member, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "project id")
	if !ok {
		return
	}
	p, err := h.Queries.GetProjectInWorkspace(r.Context(), db.GetProjectInWorkspaceParams{ID: id, WorkspaceID: wid})
	if err != nil {
		writeError(w, 404, "project not found")
		return
	}
	flow, err := h.Queries.GetProjectWorkflow(r.Context(), id)
	if err != nil {
		writeError(w, 404, "project workflow not found")
		return
	}
	resp, err := h.projectWorkflowResponse(r.Context(), p, flow, uid, member.Role)
	if err != nil {
		writeError(w, 500, "failed to load project execution")
		return
	}
	writeJSON(w, 200, resp)
}

type projectWorkflowAction struct {
	Action             string `json:"action"`
	Version            int32  `json:"version"`
	AssigneeType       string `json:"assignee_type"`
	AssigneeID         string `json:"assignee_id"`
	Title              string `json:"title"`
	Description        string `json:"description"`
	AcceptanceCriteria string `json:"acceptance_criteria"`
	Result             string `json:"result"`
	Note               string `json:"note"`
}

func (h *Handler) ProjectWorkflowAction(w http.ResponseWriter, r *http.Request) {
	wid, uid, member, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "project id")
	if !ok {
		return
	}
	var req projectWorkflowAction
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&req) != nil {
		writeError(w, 400, "invalid project action")
		return
	}
	ctx := r.Context()
	tx, err := h.TxStarter.Begin(ctx)
	if err != nil {
		writeError(w, 500, "failed to start project action")
		return
	}
	defer tx.Rollback(context.WithoutCancel(ctx))
	q := h.Queries.WithTx(tx)
	if _, err := q.LockProjectWorkspace(ctx, wid); err != nil {
		writeError(w, 404, "workspace not found")
		return
	}
	if _, err := q.LockProjectForDelete(ctx, db.LockProjectForDeleteParams{ID: id, WorkspaceID: wid}); err != nil {
		writeError(w, 404, "project not found")
		return
	}
	p, err := q.GetProjectInWorkspace(ctx, db.GetProjectInWorkspaceParams{ID: id, WorkspaceID: wid})
	if err != nil {
		writeError(w, 404, "project not found")
		return
	}
	flow, err := q.LockProjectWorkflow(ctx, id)
	if err != nil {
		writeError(w, 404, "project workflow not found")
		return
	}
	manage := flow.CreatedBy == uid || roleAllowed(member.Role, "owner", "admin")
	if !manage && !(req.Action == "submit" && p.LeadType.String == "member" && p.LeadID == uid) {
		writeError(w, 403, "project action requires its requester or administrator")
		return
	}
	if flow.Version != req.Version {
		writeError(w, 409, "project changed; reload before trying again")
		return
	}
	var issue db.Issue
	if flow.ExecutionIssueID.Valid {
		issue, err = q.LockProjectExecution(ctx, db.LockProjectExecutionParams{ID: flow.ExecutionIssueID, WorkspaceID: wid})
		if err != nil {
			writeError(w, 409, "project execution is missing")
			return
		}
	}
	if issue.ID.Valid && (req.Action == "retry" || req.Action == "submit" || req.Action == "approve" || req.Action == "reject") {
		active, err := q.HasProjectExecutionTask(ctx, issue.ID)
		if err != nil {
			writeError(w, 500, "failed to check project execution")
			return
		}
		if active {
			writeError(w, 409, "project execution is still active; wait for it to finish")
			return
		}
	}
	previousStatus := issue.Status
	state := service.ProjectWorkflowState(flow.State, issue.Status)
	next, err := service.ProjectWorkflowTransition(state, req.Action)
	if err != nil {
		writeError(w, 409, err.Error())
		return
	}
	params := db.UpdateProjectParams{ID: p.ID, Title: pgtype.Text{String: p.Title, Valid: true}, Description: p.Description, Icon: p.Icon, Status: pgtype.Text{String: p.Status, Valid: true}, Priority: pgtype.Text{String: p.Priority, Valid: true}, LeadType: p.LeadType, LeadID: p.LeadID, StartDate: p.StartDate, DueDate: p.DueDate}
	enqueue := false
	switch req.Action {
	case "edit":
		if strings.TrimSpace(req.Title) == "" || strings.TrimSpace(req.AcceptanceCriteria) == "" {
			writeError(w, 400, "title and acceptance criteria are required")
			return
		}
		params.Title.String = strings.TrimSpace(req.Title)
		params.Description = pgtype.Text{String: strings.TrimSpace(req.Description), Valid: true}
		flow.AcceptanceCriteria = strings.TrimSpace(req.AcceptanceCriteria)
	case "assign":
		if strings.TrimSpace(flow.AcceptanceCriteria) == "" {
			writeError(w, 400, "define acceptance criteria before assigning")
			return
		}
		if req.AssigneeType != "member" && req.AssigneeType != "agent" {
			writeError(w, 400, "assign a member or agent")
			return
		}
		assignee, valid := parseUUIDOrBadRequest(w, req.AssigneeID, "assignee id")
		if !valid {
			return
		}
		kind := pgtype.Text{String: req.AssigneeType, Valid: true}
		if code, message := h.validateAssigneePair(ctx, r, uuidToString(wid), kind, assignee); code != 0 {
			writeError(w, code, message)
			return
		}
		number, err := q.IncrementIssueCounter(ctx, wid)
		if err != nil {
			writeError(w, 500, "failed to allocate project execution")
			return
		}
		brief := fmt.Sprintf("%s\n\n## Acceptance criteria\n%s\n\nComplete this project and post the final deliverable as an issue comment. Set the issue status to in_review when ready for human acceptance. Do not mark the project completed; only its requester or administrator can accept it.", p.Description.String, flow.AcceptanceCriteria)
		issue, err = q.CreateIssue(ctx, db.CreateIssueParams{WorkspaceID: wid, Title: p.Title, Description: pgtype.Text{String: brief, Valid: true}, Status: "todo", Priority: "none", AssigneeType: kind, AssigneeID: assignee, CreatorType: "member", CreatorID: uid, ProjectID: p.ID, Number: number, Position: -float64(number)})
		if err != nil {
			writeError(w, 500, "failed to create project execution")
			return
		}
		flow.ExecutionIssueID = issue.ID
		params.LeadType, params.LeadID = kind, assignee
		params.Status.String = "in_progress"
		enqueue = req.AssigneeType == "agent"
	case "submit":
		if strings.TrimSpace(req.Result) == "" {
			writeError(w, 400, "a deliverable is required")
			return
		}
		flow.Result = strings.TrimSpace(req.Result)
		if _, err := q.CreateComment(ctx, db.CreateCommentParams{IssueID: issue.ID, WorkspaceID: wid, AuthorType: "member", AuthorID: uid, Content: flow.Result, Type: "comment"}); err != nil {
			writeError(w, 500, "failed to save the project deliverable")
			return
		}

		issue, err = q.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{ID: issue.ID, WorkspaceID: wid, Status: "in_review"})
	case "approve":
		result := flow.Result
		if result == "" {
			result, err = q.GetProjectWorkflowResult(ctx, db.GetProjectWorkflowResultParams{IssueID: issue.ID, WorkspaceID: wid, Since: flow.UpdatedAt, AuthorID: p.LeadID})
		}
		if strings.TrimSpace(result) == "" {
			writeError(w, 409, "a deliverable is required before acceptance")
			return
		}
		if req.Result != result {
			writeError(w, http.StatusConflict, "deliverable changed; review it again before acceptance")
			return
		}
		flow.Result, flow.ReviewNote, flow.ReviewedBy = result, strings.TrimSpace(req.Note), uid
		params.Status.String = "completed"
		issue, err = q.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{ID: issue.ID, WorkspaceID: wid, Status: "done"})
	case "reject":
		if strings.TrimSpace(req.Note) == "" {
			writeError(w, 400, "describe the changes needed")
			return
		}
		flow.Result, flow.ReviewNote = "", strings.TrimSpace(req.Note)
		_, err = q.CreateComment(ctx, db.CreateCommentParams{IssueID: issue.ID, WorkspaceID: wid, AuthorType: "member", AuthorID: uid, Content: "Changes requested: " + flow.ReviewNote, Type: "comment"})
		if err == nil {
			issue, err = q.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{ID: issue.ID, WorkspaceID: wid, Status: "todo"})
		}
		enqueue = p.LeadType.String == "agent"
	case "retry":
		if p.LeadType.String != "agent" {
			writeError(w, 400, "only agent execution can be retried")
			return
		}
		enqueue = true
	}
	if err != nil {
		writeError(w, 500, "failed to update project execution")
		return
	}
	p, err = q.UpdateProject(ctx, params)
	if err == nil {
		flow, err = q.SaveProjectWorkflow(ctx, db.SaveProjectWorkflowParams{ProjectID: id, AcceptanceCriteria: flow.AcceptanceCriteria, ExecutionIssueID: flow.ExecutionIssueID, State: next, Result: flow.Result, ReviewNote: flow.ReviewNote, ReviewedBy: flow.ReviewedBy})
	}
	if err != nil {
		writeError(w, 500, "failed to update project")
		return
	}
	if err = tx.Commit(ctx); err != nil {
		writeError(w, 500, "failed to commit project action")
		return
	}
	h.publish(protocol.EventProjectUpdated, uuidToString(wid), "member", uuidToString(uid), map[string]any{"project": projectToResponse(p)})
	if issue.ID.Valid {
		event := protocol.EventIssueUpdated
		if req.Action == "assign" {
			event = protocol.EventIssueCreated
		}
		h.publish(event, uuidToString(wid), "member", uuidToString(uid), map[string]any{"issue": issueToResponse(issue, h.getIssuePrefix(ctx, wid)), "status_changed": previousStatus != issue.Status, "prev_status": previousStatus})
	}
	if enqueue {
		if _, err := h.TaskService.EnqueueTaskForIssueWithHandoff(ctx, issue, flow.ReviewNote, uid); err != nil {
			writeError(w, http.StatusServiceUnavailable, "project saved; agent dispatch failed, retry execution from the project")
			return
		}
	}
	resp, err := h.projectWorkflowResponse(ctx, p, flow, uid, member.Role)
	if err != nil {
		writeError(w, 500, "project saved; reload its execution")
		return
	}
	writeJSON(w, 200, resp)
}
