package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/iteamify-ai/iteamify/server/internal/events"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/iteamify-ai/iteamify/server/pkg/protocol"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type DirectMessageResponse struct {
	ID              string `json:"id"`
	ChatSessionID   string `json:"chat_session_id"`
	SenderID        string `json:"sender_id"`
	ClientMessageID string `json:"client_message_id"`
	Sequence        int64  `json:"sequence"`
	Content         string `json:"content"`
	CreatedAt       string `json:"created_at"`
}
type DirectMessagesPageResponse struct {
	Messages     []DirectMessageResponse `json:"messages"`
	HasMore      bool                    `json:"has_more"`
	NextCursor   *int64                  `json:"next_cursor"`
	ReadSequence int64                   `json:"read_sequence"`
	CanSend      bool                    `json:"can_send"`
}
type DirectSessionResponse struct {
	Container          SessionContainerResponse `json:"container"`
	ContainerHasUnread bool                     `json:"container_has_unread"`
	LastActivityAt     *string                  `json:"last_activity_at"`
	ID                 string                   `json:"id"`
	WorkspaceID        string                   `json:"workspace_id"`
	Kind               string                   `json:"kind"`
	PeerUserID         string                   `json:"peer_user_id"`
	Title              string                   `json:"title"`
	HasUnread          bool                     `json:"has_unread"`
	LastSequence       int64                    `json:"last_sequence"`
	LastMessageAt      *string                  `json:"last_message_at"`
	LastMessageContent string                   `json:"last_message_content"`
	CreatedAt          string                   `json:"created_at"`
}
type DirectSendResponse struct {
	Session DirectSessionResponse `json:"session"`
	Message DirectMessageResponse `json:"message"`
}
type TeamActivityResponse struct {
	TargetType      string  `json:"target_type"`
	TargetID        string  `json:"target_id"`
	LastContactAt   *string `json:"last_contact_at"`
	ResumeSessionID *string `json:"resume_session_id"`
	HasUnread       bool    `json:"has_unread"`
}

func directMessageResponse(m db.ChatMessage) DirectMessageResponse {
	return DirectMessageResponse{uuidToString(m.ID), uuidToString(m.ChatSessionID), uuidToString(m.SenderID), uuidToString(m.ClientMessageID), m.Sequence.Int64, m.Content, m.CreatedAt.Time.UTC().Format(time.RFC3339Nano)}
}
func directPeer(s db.ChatSession, uid pgtype.UUID) pgtype.UUID {
	if s.CreatorID == uid {
		return s.PeerUserID
	}
	return s.CreatorID
}
func directReadSequence(s db.ChatSession, uid pgtype.UUID) int64 {
	if s.CreatorID == uid {
		return s.CreatorReadSequence
	}
	return s.PeerReadSequence
}
func directSessionResponse(s db.ChatSession, uid pgtype.UUID, preview string) DirectSessionResponse {
	return DirectSessionResponse{ID: uuidToString(s.ID), WorkspaceID: uuidToString(s.WorkspaceID), Kind: "direct", PeerUserID: uuidToString(directPeer(s, uid)), Title: s.Title, HasUnread: s.LastSequence > directReadSequence(s, uid), LastSequence: s.LastSequence, LastMessageAt: nullableContactTime(s.DirectLastMessageAt), LastMessageContent: preview, CreatedAt: timestampToString(s.CreatedAt), Container: sessionContainerResponse(s.ContainerType, s.ContainerResourceType, s.ContainerResourceID), LastActivityAt: nullableContactTime(s.LastActivityAt)}
}

// Resolve only authenticated human identities, never an agent's owner credential.
// Fresh membership reads also protect requests that passed a cached middleware gate.
func (h *Handler) directMessageActor(w http.ResponseWriter, r *http.Request) (pgtype.UUID, pgtype.UUID, db.Member, bool) {
	switch r.Header.Get("X-Actor-Source") {
	case "task_token", "cloud_pat":
		writeError(w, http.StatusForbidden, "member messages are only available to human actors")
		return pgtype.UUID{}, pgtype.UUID{}, db.Member{}, false
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return pgtype.UUID{}, pgtype.UUID{}, db.Member{}, false
	}
	uid, ok := parseUUIDOrBadRequest(w, userID, "user id")
	if !ok {
		return pgtype.UUID{}, pgtype.UUID{}, db.Member{}, false
	}
	wid, ok := parseUUIDOrBadRequest(w, ctxWorkspaceID(r.Context()), "workspace id")
	if !ok {
		return pgtype.UUID{}, pgtype.UUID{}, db.Member{}, false
	}
	member, err := h.Queries.GetMemberByUserAndWorkspace(r.Context(), db.GetMemberByUserAndWorkspaceParams{WorkspaceID: wid, UserID: uid})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusForbidden, "not a workspace member")
		} else {
			writeError(w, http.StatusInternalServerError, "failed to verify membership")
		}
		return pgtype.UUID{}, pgtype.UUID{}, db.Member{}, false
	}
	return wid, uid, member, true
}

func (h *Handler) loadDirectSession(w http.ResponseWriter, r *http.Request, wid, uid pgtype.UUID) (db.ChatSession, bool) {
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "sessionId"), "sessionId")
	if !ok {
		return db.ChatSession{}, false
	}
	s, err := h.Queries.GetChatSessionInWorkspace(r.Context(), db.GetChatSessionInWorkspaceParams{ID: id, WorkspaceID: wid})
	if err != nil {
		writeError(w, 404, "chat session not found")
		return db.ChatSession{}, false
	}
	if s.Kind != "direct" || (s.CreatorID != uid && s.PeerUserID != uid) {
		writeError(w, 403, "not your direct session")
		return db.ChatSession{}, false
	}
	return s, true
}
func (h *Handler) GetDirectSession(w http.ResponseWriter, r *http.Request) {
	wid, uid, _, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	s, ok := h.loadDirectSession(w, r, wid, uid)
	if !ok {
		return
	}
	if !containerClientAllowed(w, r, s) {
		return
	}
	resp := directSessionResponse(s, uid, "")
	if s.ContainerType == "contract_review" {
		review, err := h.Queries.GetContractReview(r.Context(), db.GetContractReviewParams{ID: s.ID, WorkspaceID: wid})
		if err != nil {
			contractReviewError(w, err)
			return
		}
		{
			read := review.CreatorReadVersion
			if uid != s.CreatorID {
				read = review.PeerReadVersion
			}
			resp.ContainerHasUnread = review.Version > read
			resp.HasUnread = resp.HasUnread || resp.ContainerHasUnread
		}
	}
	writeJSON(w, 200, resp)
}
func (h *Handler) ListDirectSessions(w http.ResponseWriter, r *http.Request) {
	if status := r.URL.Query().Get("status"); status != "" && status != "active" {
		writeError(w, 400, "direct sessions only support active history")
		return
	}
	wid, uid, _, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	peer, ok := parseUUIDOrBadRequest(w, r.URL.Query().Get("peer_user_id"), "peer_user_id")
	if !ok {
		return
	}
	if peer == uid {
		writeError(w, 400, "choose another workspace member")
		return
	}
	limit, before, beforeID, _, ok := parseSessionPage(w, r)
	if !ok {
		return
	}
	rows, err := h.Queries.ListDirectSessions(r.Context(), db.ListDirectSessionsParams{WorkspaceID: wid, UserID: uid, PeerUserID: peer, BeforeTime: before, BeforeID: beforeID, PageLimit: int32(limit + 1)})
	if err != nil {
		writeError(w, 500, "failed to load sessions")
		return
	}
	result := struct {
		Sessions   []DirectSessionResponse `json:"sessions"`
		NextCursor *string                 `json:"next_cursor"`
	}{Sessions: []DirectSessionResponse{}}
	if len(rows) > limit {
		rows = rows[:limit]
		last := rows[len(rows)-1]
		at := laterContactTime(last.DirectLastMessageAt, last.LastActivityAt)
		if !at.Valid {
			at = last.CreatedAt
		}
		cursor := sessionPageCursor(at, last.ID)
		result.NextCursor = &cursor
	}
	for _, row := range rows {
		resp := DirectSessionResponse{ID: uuidToString(row.ID), WorkspaceID: uuidToString(row.WorkspaceID), Kind: "direct", PeerUserID: uuidToString(peer), Title: row.Title, Container: sessionContainerResponse(row.ContainerType, row.ContainerResourceType, row.ContainerResourceID), ContainerHasUnread: row.ContainerHasUnread, LastActivityAt: nullableContactTime(row.LastActivityAt), LastSequence: row.LastSequence, LastMessageAt: nullableContactTime(row.DirectLastMessageAt), LastMessageContent: row.LastMessageContent, CreatedAt: timestampToString(row.CreatedAt)}
		read := row.CreatorReadSequence
		if row.CreatorID != uid {
			read = row.PeerReadSequence
		}
		resp.HasUnread = row.LastSequence > read || row.ContainerHasUnread
		result.Sessions = append(result.Sessions, resp)
	}
	writeJSON(w, 200, result)
}
func (h *Handler) ListDirectMessages(w http.ResponseWriter, r *http.Request) {
	wid, uid, _, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	s, ok := h.loadDirectSession(w, r, wid, uid)
	if !ok {
		return
	}
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 100 {
			writeError(w, 400, "limit must be between 1 and 100")
			return
		}
		limit = n
	}
	before := pgtype.Int8{}
	if raw := r.URL.Query().Get("before"); raw != "" {
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || n < 1 {
			writeError(w, 400, "invalid message cursor")
			return
		}
		before = pgtype.Int8{Int64: n, Valid: true}
	}
	_, err := h.Queries.GetMemberByUserAndWorkspace(r.Context(), db.GetMemberByUserAndWorkspaceParams{WorkspaceID: wid, UserID: directPeer(s, uid)})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 500, "failed to verify member")
		return
	}
	page := DirectMessagesPageResponse{Messages: []DirectMessageResponse{}, ReadSequence: directReadSequence(s, uid), CanSend: err == nil}
	rows, err := h.Queries.ListDirectMessagesPage(r.Context(), db.ListDirectMessagesPageParams{WorkspaceID: wid, ConversationID: s.ID, BeforeSequence: before, PageLimit: int32(limit + 1)})
	if err != nil {
		writeError(w, 500, "failed to load messages")
		return
	}
	page.HasMore = len(rows) > limit
	if page.HasMore {
		rows = rows[:limit]
		cursor := rows[len(rows)-1].Sequence.Int64
		page.NextCursor = &cursor
	}
	for i := len(rows) - 1; i >= 0; i-- {
		page.Messages = append(page.Messages, directMessageResponse(rows[i]))
	}
	writeJSON(w, 200, page)
}
func (h *Handler) SendDirectMessage(w http.ResponseWriter, r *http.Request) {
	var req CreateChatSessionRequest
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 128*1024)).Decode(&req) != nil {
		writeError(w, 400, "invalid message")
		return
	}
	req.SessionID = chi.URLParam(r, "sessionId")
	h.sendDirectMessage(w, r, req, false)
}

// A new direct session and its first message commit together. The client-supplied
// session UUID and sender/message UUID make a lost-response retry safe.
func (h *Handler) sendDirectMessage(w http.ResponseWriter, r *http.Request, req CreateChatSessionRequest, creating bool) {
	wid, uid, _, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	sid, ok := parseUUIDOrBadRequest(w, req.SessionID, "session_id")
	if !ok {
		return
	}
	cid, ok := parseUUIDOrBadRequest(w, req.ClientMessageID, "client_message_id")
	if !ok {
		return
	}
	if strings.TrimSpace(req.Content) == "" || utf8.RuneCountInString(req.Content) > 20000 {
		writeError(w, 400, "message must contain between 1 and 20000 characters")
		return
	}
	if (req.Kind != "" && req.Kind != "direct") || req.AgentID != "" || req.ProjectID != nil || len(req.ContextResources) > 0 || len(req.AttachmentIDs) > 0 {
		writeError(w, 400, "direct messages do not accept agent context or attachments")
		return
	}
	var peer pgtype.UUID
	if creating {
		peer, ok = parseUUIDOrBadRequest(w, req.PeerUserID, "peer_user_id")
		if !ok {
			return
		}
		if peer == uid {
			writeError(w, 400, "choose another workspace member")
			return
		}

	} else {
		s, ok := h.loadDirectSession(w, r, wid, uid)
		if !ok {
			return
		}
		if !containerClientAllowed(w, r, s) {
			return
		}
		peer = directPeer(s, uid)
	}
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, 500, "failed to start message transaction")
		return
	}
	defer tx.Rollback(r.Context())
	q := h.Queries.WithTx(tx)
	if _, err = q.LockWorkspaceForChatSessionCreate(r.Context(), wid); err != nil {
		writeError(w, 404, "workspace not found")
		return
	}
	members, err := q.LockDirectMessageMembers(r.Context(), db.LockDirectMessageMembersParams{WorkspaceID: wid, UserIds: []pgtype.UUID{uid, peer}})
	if err != nil {
		writeError(w, 500, "failed to verify members")
		return
	}
	if len(members) != 2 {
		writeError(w, 403, "both participants must be workspace members")
		return
	}
	var s db.ChatSession
	if creating {
		title := []rune(strings.Join(strings.Fields(req.Content), " "))
		if len(title) > 80 {
			title = title[:80]
		}
		s, err = q.EnsureDirectSession(r.Context(), db.EnsureDirectSessionParams{ID: sid, WorkspaceID: wid, CreatorID: uid, PeerUserID: peer, Title: string(title)})
	} else {
		s, err = q.LockDirectSession(r.Context(), db.LockDirectSessionParams{ID: sid, WorkspaceID: wid})
	}
	if err != nil {
		writeError(w, 500, "failed to open session")
		return
	}
	if s.WorkspaceID != wid || s.Kind != "direct" || (s.CreatorID != uid && s.PeerUserID != uid) || directPeer(s, uid) != peer || (creating && s.CreatorID != uid) {
		writeError(w, 409, "session key already used")
		return
	}
	if creating && s.ContainerType != "conversation" {
		writeError(w, 409, "session key already used")
		return
	}
	if !containerClientAllowed(w, r, s) {
		return
	}
	if s.ContainerType != "conversation" && s.ContainerType != "contract_review" {
		writeError(w, 409, "unsupported session container")
		return
	}
	existing, err := q.GetDirectMessageByClientID(r.Context(), db.GetDirectMessageByClientIDParams{WorkspaceID: wid, ConversationID: sid, SenderID: uid, ClientMessageID: cid})
	if err == nil {
		if existing.Content != req.Content {
			writeError(w, 409, "message key already used for different content")
			return
		}
		preview, err := q.GetDirectSessionPreview(r.Context(), db.GetDirectSessionPreviewParams{WorkspaceID: wid, SessionID: sid})
		if err != nil {
			writeError(w, 500, "failed to load session preview")
			return
		}
		writeJSON(w, 200, DirectSendResponse{h.directSessionWithContainer(r.Context(), s, uid, preview), directMessageResponse(existing)})
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 500, "failed to verify message key")
		return
	}
	if creating && s.LastSequence > 0 {
		writeError(w, 409, "session key already used for another first message")
		return
	}
	m, err := q.CreateDirectMessage(r.Context(), db.CreateDirectMessageParams{ConversationID: sid, SenderID: uid, ClientMessageID: cid, Sequence: pgtype.Int8{Int64: s.LastSequence + 1, Valid: true}, Content: req.Content})
	if err != nil {
		writeError(w, 500, "failed to send message")
		return
	}
	s, err = q.AdvanceDirectConversation(r.Context(), db.AdvanceDirectConversationParams{WorkspaceID: wid, ID: sid, SenderID: uid, Sequence: m.Sequence.Int64, MessageAt: m.CreatedAt})
	if err != nil {
		writeError(w, 500, "failed to update session")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		writeError(w, 500, "failed to commit message")
		return
	}
	response := directMessageResponse(m)
	for _, recipient := range []pgtype.UUID{uid, peer} {
		target := uid
		if recipient == uid {
			target = peer
		}
		h.Bus.Publish(events.Event{Type: protocol.EventDirectMessage, WorkspaceID: uuidToString(wid), ActorType: "member", ActorID: uuidToString(uid), ChatSessionID: uuidToString(sid), RecipientUserID: uuidToString(recipient), Payload: map[string]any{"workspace_id": uuidToString(wid), "other_user_id": uuidToString(target), "session": h.directSessionWithContainer(r.Context(), s, recipient, m.Content), "message": response}})
	}
	writeJSON(w, 201, DirectSendResponse{h.directSessionWithContainer(r.Context(), s, uid, m.Content), response})
}
func (h *Handler) MarkDirectMessagesRead(w http.ResponseWriter, r *http.Request) {
	wid, uid, _, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	s, ok := h.loadDirectSession(w, r, wid, uid)
	if !ok {
		return
	}
	var req struct {
		Sequence int64 `json:"sequence"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&req) != nil || req.Sequence < 0 {
		writeError(w, 400, "invalid read sequence")
		return
	}
	s, err := h.Queries.MarkDirectConversationRead(r.Context(), db.MarkDirectConversationReadParams{WorkspaceID: wid, ID: s.ID, UserID: uid, Sequence: req.Sequence})
	if err != nil {
		writeError(w, 500, "failed to mark session read")
		return
	}
	h.Bus.Publish(events.Event{Type: protocol.EventDirectRead, WorkspaceID: uuidToString(wid), ActorType: "member", ActorID: uuidToString(uid), ChatSessionID: uuidToString(s.ID), RecipientUserID: uuidToString(uid), Payload: map[string]any{"workspace_id": uuidToString(wid), "other_user_id": uuidToString(directPeer(s, uid)), "chat_session_id": uuidToString(s.ID), "read_sequence": directReadSequence(s, uid)}})
	w.WriteHeader(204)
}
func nullableContactTime(value pgtype.Timestamptz) *string {
	if !value.Valid {
		return nil
	}
	s := value.Time.UTC().Format(time.RFC3339Nano)
	return &s
}

func (h *Handler) ListTeamActivity(w http.ResponseWriter, r *http.Request) {
	wid, uid, member, ok := h.directMessageActor(w, r)
	if !ok {
		return
	}
	allowed, ok := h.accessibleAgentIDs(r.Context(), uuidToString(wid), "member", uuidToString(uid), member.Role)
	if !ok {
		writeError(w, 500, "failed to resolve agent access")
		return
	}
	agents, err := h.Queries.ListTeamAgentActivity(r.Context(), db.ListTeamAgentActivityParams{WorkspaceID: wid, UserID: uid})
	if err != nil {
		writeError(w, 500, "failed to load assistant activity")
		return
	}
	directs, err := h.Queries.ListDirectConversationActivity(r.Context(), db.ListDirectConversationActivityParams{WorkspaceID: wid, UserID: uid})
	if err != nil {
		writeError(w, 500, "failed to load member activity")
		return
	}
	result := make([]TeamActivityResponse, 0, len(agents)+len(directs))
	for _, a := range agents {
		id := uuidToString(a.AgentID)
		if _, found := allowed[id]; !found {
			continue
		}
		result = append(result, TeamActivityResponse{"agent", id, nullableContactTime(a.LastContactAt), uuidToPtr(a.ResumeSessionID), a.HasUnread})
	}
	for _, d := range directs {
		result = append(result, TeamActivityResponse{"member", uuidToString(d.OtherUserID), nullableContactTime(d.LastMessageAt), uuidToPtr(d.ResumeSessionID), d.HasUnread})
	}
	writeJSON(w, 200, result)
}
