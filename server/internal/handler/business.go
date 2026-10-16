package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/iteamify-ai/iteamify/server/internal/service"
	"github.com/jackc/pgx/v5/pgtype"
)

func (h *Handler) requireBusinessService(w http.ResponseWriter) *service.BusinessService {
	if h.BusinessService == nil {
		writeError(w, http.StatusServiceUnavailable, "business service not configured")
		return nil
	}
	return h.BusinessService
}

func (h *Handler) businessWorkspaceID(w http.ResponseWriter, r *http.Request) (pgtype.UUID, bool) {
	return parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace_id")
}

// GetBusinessContext returns the Company profile view permitted for the
// current member. Owners/admins receive Draft + Published; regular members
// receive Published only. Production agents never use this endpoint and read
// their task-pinned published release through the scoped Company path.
func (h *Handler) GetBusinessContext(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, ok := h.businessWorkspaceID(w, r)
	if !ok {
		return
	}
	state, err := svc.Get(r.Context(), workspaceID)
	if err != nil {
		slog.Error("business: get context", "err", err)
		writeBusinessError(w, err, nil)
		return
	}
	member, ok := h.workspaceMember(w, r, h.resolveWorkspaceID(r))
	if !ok {
		return
	}
	state = businessContextForRole(state, member.Role)
	writeJSON(w, http.StatusOK, state)
}

func businessContextForRole(state service.BusinessContextState, role string) service.BusinessContextState {
	if roleAllowed(role, "owner", "admin") {
		return state
	}
	// Keep the response schema stable for installed clients while ensuring no
	// unpublished fact, validation gap, or change signal crosses the member
	// boundary. The UI already treats Published as authoritative.
	state.Draft = service.EmptyBusinessContent()
	if state.Published != nil {
		state.Draft = *state.Published
	}
	state.DraftRevision = 0
	state.HasUnpublishedChanges = false
	state.ValidationIssues = []service.BusinessValidationIssue{}
	return state
}

func (h *Handler) UpdateBusinessDraft(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, ok := h.businessWorkspaceID(w, r)
	if !ok {
		return
	}
	userID, ok := parseUUIDOrBadRequest(w, requestUserID(r), "user_id")
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var body struct {
		ExpectedRevision int32                   `json:"expected_revision"`
		Content          service.BusinessContent `json:"content"`
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil || body.ExpectedRevision < 0 {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	state, err := svc.SaveDraft(r.Context(), workspaceID, userID, body.ExpectedRevision, body.Content)
	if err != nil {
		writeBusinessError(w, err, nil)
		return
	}
	writeJSON(w, http.StatusOK, state)
}

// UpdateCompanyProfile saves the single live Company profile. The service
// creates an internal snapshot atomically so task-pinned context remains
// reproducible without exposing a publishing workflow to users.
func (h *Handler) UpdateCompanyProfile(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, ok := h.businessWorkspaceID(w, r)
	if !ok {
		return
	}
	userID, ok := parseUUIDOrBadRequest(w, requestUserID(r), "user_id")
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var body struct {
		ExpectedRevision int32                   `json:"expected_revision"`
		Content          service.BusinessContent `json:"content"`
		ChangeSummary    string                  `json:"change_summary"`
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil || body.ExpectedRevision < 0 || len(body.ChangeSummary) > 1000 {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	state, err := svc.SaveProfile(r.Context(), workspaceID, userID, body.ExpectedRevision, body.Content, body.ChangeSummary)
	if err != nil {
		issues := []service.BusinessValidationIssue(nil)
		if errors.Is(err, service.ErrBusinessInvalid) {
			issues = service.ValidateBusinessContent(body.Content, false)
		}
		writeBusinessError(w, err, issues)
		return
	}
	writeJSON(w, http.StatusOK, state)
}

func (h *Handler) PublishBusinessContext(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, ok := h.businessWorkspaceID(w, r)
	if !ok {
		return
	}
	userID, ok := parseUUIDOrBadRequest(w, requestUserID(r), "user_id")
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var body struct {
		ExpectedRevision int32  `json:"expected_revision"`
		ChangeSummary    string `json:"change_summary"`
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil || body.ExpectedRevision < 1 || len(body.ChangeSummary) > 1000 {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	release, state, err := svc.Publish(r.Context(), workspaceID, userID, body.ExpectedRevision, body.ChangeSummary)
	if err != nil {
		issues := []service.BusinessValidationIssue(nil)
		if errors.Is(err, service.ErrBusinessIncomplete) {
			if current, getErr := svc.Get(r.Context(), workspaceID); getErr == nil {
				issues = current.ValidationIssues
			}
		}
		writeBusinessError(w, err, issues)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"release": release, "context": state})
}

func (h *Handler) ListBusinessReleases(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, ok := h.businessWorkspaceID(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	releases, err := svc.ListReleases(r.Context(), workspaceID, int32(limit))
	if err != nil {
		writeBusinessError(w, err, nil)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"releases": releases})
}

func (h *Handler) GetBusinessRelease(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, ok := h.businessWorkspaceID(w, r)
	if !ok {
		return
	}
	releaseID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "releaseId"), "release_id")
	if !ok {
		return
	}
	release, err := svc.GetRelease(r.Context(), workspaceID, releaseID)
	if err != nil {
		writeBusinessError(w, err, nil)
		return
	}
	writeJSON(w, http.StatusOK, release)
}

func (h *Handler) ListBusinessProposals(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, ok := h.businessWorkspaceID(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	proposals, err := svc.ListProposals(r.Context(), workspaceID, r.URL.Query().Get("status"), int32(limit))
	if err != nil {
		writeBusinessError(w, err, nil)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"proposals": proposals})
}

func (h *Handler) GetBusinessProposal(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, ok := h.businessWorkspaceID(w, r)
	if !ok {
		return
	}
	proposalID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "proposalId"), "proposal_id")
	if !ok {
		return
	}
	proposal, err := svc.GetProposal(r.Context(), workspaceID, proposalID)
	if err != nil {
		writeBusinessError(w, err, nil)
		return
	}
	writeJSON(w, http.StatusOK, proposal)
}

// CreateBusinessProposal lets a human collaborator submit a typed proposal.
// Chat agents use the task-scoped sibling below, which records task/session
// provenance automatically.
func (h *Handler) CreateBusinessProposal(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, ok := h.businessWorkspaceID(w, r)
	if !ok {
		return
	}
	actorID, ok := parseUUIDOrBadRequest(w, requestUserID(r), "user_id")
	if !ok {
		return
	}
	input, ok := decodeBusinessProposalInput(w, r)
	if !ok {
		return
	}
	proposal, err := svc.CreateProposal(r.Context(), workspaceID, pgtype.UUID{}, pgtype.UUID{}, "member", actorID, input)
	if err != nil {
		writeBusinessError(w, err, nil)
		return
	}
	writeJSON(w, http.StatusCreated, proposal)
}

func (h *Handler) ApplyBusinessProposal(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, ok := h.businessWorkspaceID(w, r)
	if !ok {
		return
	}
	proposalID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "proposalId"), "proposal_id")
	if !ok {
		return
	}
	userID, ok := parseUUIDOrBadRequest(w, requestUserID(r), "user_id")
	if !ok {
		return
	}
	var body struct {
		ExpectedRevision int32 `json:"expected_revision"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil || body.ExpectedRevision < 0 {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	proposal, state, err := svc.ApplyProposal(r.Context(), workspaceID, proposalID, userID, body.ExpectedRevision)
	if err != nil {
		writeBusinessError(w, err, nil)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"proposal": proposal, "context": state})
}

func (h *Handler) RejectBusinessProposal(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, ok := h.businessWorkspaceID(w, r)
	if !ok {
		return
	}
	proposalID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "proposalId"), "proposal_id")
	if !ok {
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil || len(body.Reason) > 1000 {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	proposal, err := svc.RejectProposal(r.Context(), workspaceID, proposalID, body.Reason)
	if err != nil {
		writeBusinessError(w, err, nil)
		return
	}
	writeJSON(w, http.StatusOK, proposal)
}

func (h *Handler) CreateCurrentTaskBusinessProposal(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, taskID, ok := taskActorContext(w, r)
	if !ok {
		return
	}
	task, err := h.Queries.GetAgentTask(r.Context(), taskID)
	if err != nil || !task.ChatSessionID.Valid || !h.taskCanMaintainCompany(r.Context(), task, workspaceID) {
		writeError(w, http.StatusForbidden, "company changes are available only in owner or admin maintenance chats")
		return
	}
	input, ok := decodeBusinessProposalInput(w, r)
	if !ok {
		return
	}
	proposal, err := svc.CreateProposal(r.Context(), workspaceID, task.ChatSessionID, taskID, "agent", task.AgentID, input)
	if err != nil {
		writeBusinessError(w, err, nil)
		return
	}
	writeJSON(w, http.StatusCreated, proposal)
}

// UpdateCurrentTaskCompanyProfile applies a user-confirmed maintenance-chat
// change directly to the live profile. There is no persistent proposal queue.
func (h *Handler) UpdateCurrentTaskCompanyProfile(w http.ResponseWriter, r *http.Request) {
	svc := h.requireBusinessService(w)
	if svc == nil {
		return
	}
	workspaceID, taskID, ok := taskActorContext(w, r)
	if !ok {
		return
	}
	task, err := h.Queries.GetAgentTask(r.Context(), taskID)
	if err != nil || !task.ChatSessionID.Valid || !h.taskCanMaintainCompany(r.Context(), task, workspaceID) {
		writeError(w, http.StatusForbidden, "company updates are available only in owner or admin maintenance chats")
		return
	}
	var body struct {
		service.CreateBusinessProposalInput
		Confirmed bool `json:"confirmed"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 256<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil || !body.Confirmed {
		writeError(w, http.StatusBadRequest, "explicit user confirmation is required")
		return
	}
	state, err := svc.UpdateProfile(r.Context(), workspaceID, task.OriginatorUserID, body.CreateBusinessProposalInput)
	if err != nil {
		writeBusinessError(w, err, nil)
		return
	}
	writeJSON(w, http.StatusOK, state)
}

func decodeBusinessProposalInput(w http.ResponseWriter, r *http.Request) (service.CreateBusinessProposalInput, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, 256<<10)
	var input service.CreateBusinessProposalInput
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return service.CreateBusinessProposalInput{}, false
	}
	return input, true
}

func writeBusinessError(w http.ResponseWriter, err error, issues []service.BusinessValidationIssue) {
	switch {
	case errors.Is(err, service.ErrBusinessConflict), errors.Is(err, service.ErrBusinessProposalStale):
		writeJSON(w, http.StatusConflict, map[string]any{"error": err.Error(), "code": "revision_conflict"})
	case errors.Is(err, service.ErrBusinessNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, service.ErrBusinessIncomplete):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": err.Error(), "code": "business_incomplete", "issues": issues})
	case errors.Is(err, service.ErrBusinessInvalid):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": err.Error(), "code": "business_invalid", "issues": issues})
	case errors.Is(err, service.ErrBusinessProposalInvalid):
		writeBusinessProposalInvalid(w, err)
	case errors.Is(err, service.ErrCompanyContextInvalid):
		writeError(w, http.StatusBadRequest, err.Error())
	default:
		slog.Error("business operation failed", "err", err)
		writeError(w, http.StatusInternalServerError, "business operation failed")
	}
}

func writeBusinessProposalInvalid(w http.ResponseWriter, err error) {
	payload := map[string]any{
		"error": err.Error(),
		"code":  "invalid_business_operation",
	}
	var validationErr *service.BusinessOperationValidationError
	if errors.As(err, &validationErr) {
		payload["operation_index"] = validationErr.OperationIndex
		payload["field"] = validationErr.Field
		payload["path"] = validationErr.Path
		payload["expected"] = validationErr.Expected
		payload["actual"] = validationErr.Actual
		if validationErr.Detail != "" {
			payload["detail"] = validationErr.Detail
		}
	}
	writeJSON(w, http.StatusBadRequest, payload)
}
