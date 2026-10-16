package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/iteamify-ai/iteamify/server/internal/events"
	"github.com/iteamify-ai/iteamify/server/internal/service"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/iteamify-ai/iteamify/server/pkg/protocol"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type SessionContainerResponse struct {
	Type     string                            `json:"type"`
	Resource *SessionContainerResourceResponse `json:"resource,omitempty"`
}
type SessionContainerResourceResponse struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

func laterContactTime(a, b pgtype.Timestamptz) pgtype.Timestamptz {
	if b.Valid && (!a.Valid || b.Time.After(a.Time)) {
		return b
	}
	return a
}
func sessionContainerResponse(kind string, resourceType pgtype.Text, id pgtype.UUID) SessionContainerResponse {
	resp := SessionContainerResponse{Type: kind}
	if resp.Type == "" {
		resp.Type = "conversation"
	}
	if id.Valid && resourceType.Valid {
		resp.Resource = &SessionContainerResourceResponse{Type: resourceType.String, ID: uuidToString(id)}
	}
	return resp
}
func containerClientAllowed(w http.ResponseWriter, r *http.Request, s db.ChatSession) bool {
	if s.ContainerType != "conversation" && !requestHasClientCapability(r, "session-containers-v1") {
		writeError(w, http.StatusUpgradeRequired, "update your client to open this session container")
		return false
	}
	return true
}

type ContractReviewFileResponse struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
	DownloadURL string `json:"download_url"`
}
type ContractReviewActionResponse struct {
	Action    string `json:"action"`
	Note      string `json:"note"`
	Version   int32  `json:"version"`
	CreatedAt string `json:"created_at"`
}
type ContractReviewResponse struct {
	Configuration *service.ContractApplicationConfig `json:"configuration,omitempty"`
	Task          *ContractTaskResponse              `json:"task,omitempty"`
	ID            string                             `json:"id"`
	SessionID     string                             `json:"session_id"`
	Kind          string                             `json:"kind"`
	CreatorID     string                             `json:"creator_id"`
	Fields        service.ContractReviewFields       `json:"fields"`
	Status        string                             `json:"status"`
	Result        string                             `json:"result"`
	Note          string                             `json:"note"`
	Version       int32                              `json:"version"`
	HasUnread     bool                               `json:"has_unread"`
	CanAct        bool                               `json:"can_act"`
	Files         []ContractReviewFileResponse       `json:"files"`
	Actions       []ContractReviewActionResponse     `json:"actions"`
	UpdatedAt     string                             `json:"updated_at"`
}
type ContractTaskResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Error  string `json:"error"`
}

func (h *Handler) contractReviews() *service.ContractReviewService {
	return &service.ContractReviewService{Queries: h.Queries, TxStarter: h.TxStarter, Storage: h.Storage, Tasks: h.TaskService}
}

func contractReviewError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrContractInput):
		writeError(w, 400, err.Error())
	case errors.Is(err, service.ErrContractConflict):
		writeError(w, 409, err.Error())
	case errors.Is(err, service.ErrContractForbidden):
		writeError(w, 403, err.Error())
	case errors.Is(err, pgx.ErrNoRows):
		writeError(w, 404, "contract review not found")
	default:
		writeError(w, 500, "contract review could not be saved")
	}
}

func decodeContractSubmission(w http.ResponseWriter, r *http.Request, out any) ([]service.ContractFileInput, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, 50<<20)
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		if json.NewDecoder(r.Body).Decode(out) != nil {
			writeError(w, 400, "invalid request")
			return nil, false
		}
		return nil, true
	}
	if err := r.ParseMultipartForm(2 << 20); err != nil {
		writeError(w, 400, "files exceed the 50 MB request limit")
		return nil, false
	}
	defer r.MultipartForm.RemoveAll()
	if err := json.Unmarshal([]byte(r.FormValue("request")), out); err != nil {
		writeError(w, 400, "invalid review request")
		return nil, false
	}
	headers := r.MultipartForm.File["files"]
	if len(headers) > service.MaxContractFiles {
		writeError(w, 400, "at most ten files")
		return nil, false
	}
	files := make([]service.ContractFileInput, 0, len(headers))
	for _, header := range headers {
		if header.Size > service.MaxContractFileSize {
			writeError(w, 400, "each file must be at most 20 MB")
			return nil, false
		}
		file, err := header.Open()
		if err != nil {
			writeError(w, 400, "file could not be read")
			return nil, false
		}
		data, readErr := io.ReadAll(io.LimitReader(file, service.MaxContractFileSize+1))
		closeErr := file.Close()
		if readErr != nil || closeErr != nil {
			writeError(w, 400, "file could not be read")
			return nil, false
		}
		files = append(files, service.ContractFileInput{Filename: header.Filename, Data: data})
	}
	return files, true
}

func (h *Handler) loadContractSession(w http.ResponseWriter, r *http.Request, wid, uid pgtype.UUID, id string) (db.ChatSession, bool) {
	sid, ok := parseUUIDOrBadRequest(w, id, "session_id")
	if !ok {
		return db.ChatSession{}, false
	}
	s, err := h.Queries.GetChatSessionInWorkspace(r.Context(), db.GetChatSessionInWorkspaceParams{ID: sid, WorkspaceID: wid})
	if err != nil || s.ContainerType != "contract_review" {
		writeError(w, 404, "contract review not found")
		return db.ChatSession{}, false
	}
	if s.Kind == "agent" {
		return h.gateChatSessionForUser(w, r, uuidToString(uid), uuidToString(wid), id)
	}
	if s.Kind != "direct" || (uid != s.CreatorID && uid != s.PeerUserID) {
		writeError(w, 404, "contract review not found")
		return db.ChatSession{}, false
	}
	return s, true
}

func (h *Handler) contractReviewResponse(ctx context.Context, s db.ChatSession, uid pgtype.UUID) (ContractReviewResponse, error) {
	review, err := h.Queries.GetContractReview(ctx, db.GetContractReviewParams{ID: s.ID, WorkspaceID: s.WorkspaceID})
	if err != nil {
		return ContractReviewResponse{}, err
	}
	resp := ContractReviewResponse{ID: uuidToString(review.ID), SessionID: uuidToString(s.ID), Kind: s.Kind, CreatorID: uuidToString(review.CreatorID), Status: review.Status, Result: review.Result, Note: review.Note, Version: review.Version, Files: []ContractReviewFileResponse{}, Actions: []ContractReviewActionResponse{}, UpdatedAt: timestampToString(review.UpdatedAt)}
	if err = json.Unmarshal(review.Fields, &resp.Fields); err != nil {
		return resp, err
	}
	if len(review.ApplicationSnapshot) > 0 {
		var config service.ContractApplicationConfig
		if err = json.Unmarshal(review.ApplicationSnapshot, &config); err != nil {
			return resp, err
		}
		resp.Configuration = &config
		if uid == review.CreatorID {
			resp.Configuration.ReviewInstructions = ""
			resp.Configuration.ResultRequirements = ""
			resp.Configuration.AgentInstructions = ""
		}
	}
	if s.Kind == "agent" {
		task, e := h.Queries.GetLatestContractTask(ctx, db.GetLatestContractTaskParams{WorkspaceID: s.WorkspaceID, ReviewID: s.ID})
		if e == nil {
			resp.Task = &ContractTaskResponse{ID: uuidToString(task.ID), Status: task.Status, Error: task.Error.String}
		} else if !errors.Is(e, pgx.ErrNoRows) {
			return resp, e
		}
	}
	read := review.CreatorReadVersion
	if uid != review.CreatorID {
		read = review.PeerReadVersion
	}
	resp.HasUnread = review.Version > read
	resp.CanAct = s.Status == "active"
	if s.Kind == "direct" {
		_, err = h.Queries.GetMemberByUserAndWorkspace(ctx, db.GetMemberByUserAndWorkspaceParams{WorkspaceID: s.WorkspaceID, UserID: directPeer(s, uid)})
		resp.CanAct = resp.CanAct && err == nil
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return resp, err
		}
	}
	if s.Kind == "agent" {
		agent, agentErr := h.Queries.GetAgentInWorkspace(ctx, db.GetAgentInWorkspaceParams{ID: s.AgentID, WorkspaceID: s.WorkspaceID})
		if agentErr != nil {
			return resp, agentErr
		}
		resp.CanAct = resp.CanAct && !agent.ArchivedAt.Valid && h.canInvokeAgent(ctx, agent, "member", uuidToString(uid), uuidToString(uid), uuidToString(s.WorkspaceID))
	}
	files, err := h.Queries.ListContractReviewFiles(ctx, db.ListContractReviewFilesParams{WorkspaceID: s.WorkspaceID, ReviewID: s.ID})
	if err != nil {
		return resp, err
	}
	for _, f := range files {
		resp.Files = append(resp.Files, ContractReviewFileResponse{ID: uuidToString(f.ID), Filename: f.Filename, ContentType: f.ContentType, SizeBytes: f.SizeBytes, DownloadURL: "/api/contract-review-files/" + uuidToString(f.ID) + "/download"})
	}
	actions, err := h.Queries.ListContractReviewActions(ctx, db.ListContractReviewActionsParams{WorkspaceID: s.WorkspaceID, ReviewID: s.ID})
	if err != nil {
		return resp, err
	}
	for _, a := range actions {
		resp.Actions = append(resp.Actions, ContractReviewActionResponse{Action: a.Action, Note: a.Note, Version: a.Version, CreatedAt: timestampToString(a.CreatedAt)})
	}
	return resp, nil
}

func (h *Handler) CreateContractReview(w http.ResponseWriter, r *http.Request) {
	wid, uid, _, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	var req struct {
		ApplicationID      string                       `json:"application_id"`
		ApplicationVersion int32                        `json:"application_version"`
		SessionID          string                       `json:"session_id"`
		Kind               string                       `json:"kind"`
		PeerUserID         string                       `json:"peer_user_id"`
		AgentID            string                       `json:"agent_id"`
		Fields             service.ContractReviewFields `json:"fields"`
	}
	files, ok := decodeContractSubmission(w, r, &req)
	if !ok {
		return
	}
	sid, ok := parseUUIDOrBadRequest(w, req.SessionID, "session_id")
	if !ok {
		return
	}
	in := service.ContractReviewCreate{SessionID: sid, WorkspaceID: wid, CreatorID: uid, Kind: req.Kind, Fields: req.Fields, Files: files}
	if req.ApplicationID == "" || req.ApplicationVersion < 1 {
		writeError(w, http.StatusUpgradeRequired, "refresh or update your client to use configured applications")
		return
	}
	in.ApplicationID, ok = parseUUIDOrBadRequest(w, req.ApplicationID, "application_id")
	if !ok {
		return
	}
	in.ApplicationVersion = req.ApplicationVersion
	switch req.Kind {
	case "direct":
		in.PeerUserID, ok = parseUUIDOrBadRequest(w, req.PeerUserID, "peer_user_id")
		if !ok {
			return
		}
	case "agent":
		in.AgentID, ok = parseUUIDOrBadRequest(w, req.AgentID, "agent_id")
		if !ok {
			return
		}
		agent, err := h.Queries.GetAgentInWorkspace(r.Context(), db.GetAgentInWorkspaceParams{ID: in.AgentID, WorkspaceID: wid})
		if err != nil || agent.ArchivedAt.Valid || !h.canInvokeAgent(r.Context(), agent, "member", uuidToString(uid), uuidToString(uid), uuidToString(wid)) {
			writeError(w, 403, "agent is unavailable")
			return
		}
	default:
		writeError(w, 400, "invalid session kind")
		return
	}
	review, created, err := h.contractReviews().Create(r.Context(), in)
	if err != nil {
		contractReviewError(w, err)
		return
	}
	s, err := h.Queries.GetChatSessionInWorkspace(r.Context(), db.GetChatSessionInWorkspaceParams{ID: sid, WorkspaceID: wid})
	if err != nil {
		contractReviewError(w, err)
		return
	}
	if created {
		h.publishContractReview(s, review, "member", uid)
	}
	resp, err := h.contractReviewResponse(r.Context(), s, uid)
	if err != nil {
		contractReviewError(w, err)
		return
	}
	code := 200
	if created {
		code = 201
	}
	writeJSON(w, code, resp)
}

func (h *Handler) GetContractReview(w http.ResponseWriter, r *http.Request) {
	wid, uid, _, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	s, ok := h.loadContractSession(w, r, wid, uid, chi.URLParam(r, "sessionId"))
	if !ok {
		return
	}
	resp, err := h.contractReviewResponse(r.Context(), s, uid)
	if err != nil {
		contractReviewError(w, err)
		return
	}
	writeJSON(w, 200, resp)
}
func (h *Handler) UpdateContractReview(w http.ResponseWriter, r *http.Request) {
	wid, uid, _, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	s, ok := h.loadContractSession(w, r, wid, uid, chi.URLParam(r, "sessionId"))
	if !ok {
		return
	}
	var req service.ContractReviewUpdate
	files, ok := decodeContractSubmission(w, r, &req)
	if !ok {
		return
	}
	review, err := h.contractReviews().Update(r.Context(), s, uid, false, req, files)
	if err != nil {
		contractReviewError(w, err)
		return
	}
	h.publishContractReview(s, review, "member", uid)
	resp, err := h.contractReviewResponse(r.Context(), s, uid)
	if err != nil {
		contractReviewError(w, err)
		return
	}
	writeJSON(w, 200, resp)
}
func (h *Handler) MarkContractReviewRead(w http.ResponseWriter, r *http.Request) {
	wid, uid, _, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	s, ok := h.loadContractSession(w, r, wid, uid, chi.URLParam(r, "sessionId"))
	if !ok {
		return
	}
	var req struct {
		Version int32 `json:"version"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&req) != nil || req.Version < 1 {
		writeError(w, 400, "invalid read version")
		return
	}
	if err := h.Queries.MarkContractReviewRead(r.Context(), db.MarkContractReviewReadParams{ID: s.ID, WorkspaceID: wid, UserID: uid, Version: req.Version}); err != nil {
		contractReviewError(w, err)
		return
	}
	h.Bus.Publish(events.Event{Type: protocol.EventResourceChanged, WorkspaceID: uuidToString(wid), ChatSessionID: uuidToString(s.ID), RecipientUserID: uuidToString(uid), ActorType: "member", ActorID: uuidToString(uid), Payload: map[string]any{"workspace_id": uuidToString(wid), "resource_type": "contract_review", "resource_id": uuidToString(s.ID)}})
	w.WriteHeader(204)
}
func (h *Handler) publishContractReview(s db.ChatSession, review db.ContractReview, actorType string, actor pgtype.UUID) {
	people := []pgtype.UUID{s.CreatorID}
	if s.Kind == "direct" {
		people = append(people, s.PeerUserID)
	}
	for _, person := range people {
		h.Bus.Publish(events.Event{Type: protocol.EventResourceChanged, WorkspaceID: uuidToString(s.WorkspaceID), ChatSessionID: uuidToString(s.ID), RecipientUserID: uuidToString(person), ActorType: actorType, ActorID: uuidToString(actor), Payload: map[string]any{"workspace_id": uuidToString(s.WorkspaceID), "resource_type": "contract_review", "resource_id": uuidToString(s.ID), "version": review.Version}})
	}
}

func (h *Handler) DownloadContractReviewFile(w http.ResponseWriter, r *http.Request) {
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "file_id")
	if !ok {
		return
	}
	f, err := h.Queries.GetContractReviewFile(r.Context(), id)
	if err != nil {
		writeError(w, 404, "file not found")
		return
	}
	if r.Header.Get("X-Actor-Source") == "task_token" || r.Header.Get("X-Actor-Source") == "cloud_pat" {
		p, _, allowed := h.resolveAssistantReadPrincipalAndTask(w, r)
		if !allowed {
			return
		}
		if _, err = h.assistantContractSession(r.Context(), p.Principal, uuidToString(f.ReviewID)); err != nil || p.WorkspaceUUID != f.WorkspaceID {
			writeError(w, 404, "file not found")
			return
		}
	} else {
		uidText, allowed := requireUserID(w, r)
		if !allowed {
			return
		}
		uid, allowed := parseUUIDOrBadRequest(w, uidText, "user_id")
		if !allowed {
			return
		}
		if _, err = h.Queries.GetMemberByUserAndWorkspace(r.Context(), db.GetMemberByUserAndWorkspaceParams{WorkspaceID: f.WorkspaceID, UserID: uid}); err != nil {
			writeError(w, 404, "file not found")
			return
		}
		if _, allowed = h.loadContractSession(w, r, f.WorkspaceID, uid, uuidToString(f.ReviewID)); !allowed {
			return
		}
	}
	data, err := h.contractReviews().FileContent(r.Context(), f)
	if err != nil {
		writeError(w, 500, "file could not be opened")
		return
	}
	w.Header().Set("Content-Type", f.ContentType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": f.Filename}))
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, f.Filename, time.Time{}, bytes.NewReader(data))
}

// Protect review history before the existing agent cascade, inside its transaction.
func pruneRuntimeContractReviews(ctx context.Context, q *db.Queries, runtimeID pgtype.UUID, includeSystemAgents bool) ([]string, error) {
	sessions, err := q.ListContractSessionsByRuntime(ctx, db.ListContractSessionsByRuntimeParams{RuntimeID: runtimeID, IncludeSystemAgents: includeSystemAgents})
	if err != nil {
		return nil, err
	}
	if len(sessions) > 0 {
		return nil, service.ErrContractConflict
	}
	if err = q.DeleteUnreferencedRuntimeApplications(ctx, db.DeleteUnreferencedRuntimeApplicationsParams{RuntimeID: runtimeID, IncludeSystemAgents: includeSystemAgents}); err != nil {
		return nil, err
	}
	return nil, nil
}

func (h *Handler) directSessionWithContainer(ctx context.Context, s db.ChatSession, uid pgtype.UUID, preview string) DirectSessionResponse {
	resp := directSessionResponse(s, uid, preview)
	if s.ContainerType == "contract_review" {
		review, err := h.Queries.GetContractReview(ctx, db.GetContractReviewParams{ID: s.ID, WorkspaceID: s.WorkspaceID})
		read := review.CreatorReadVersion
		if uid != s.CreatorID {
			read = review.PeerReadVersion
		}
		resp.ContainerHasUnread = err != nil || review.Version > read
		resp.HasUnread = resp.HasUnread || resp.ContainerHasUnread
	}
	return resp
}
