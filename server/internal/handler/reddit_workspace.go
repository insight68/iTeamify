package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/iteamify-ai/iteamify/server/internal/integrations/reddit"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5"
)

// Workspace identity is stamped by authentication for task tokens. Human callers
// use the regular workspace header; both paths require current membership.
func (h *Handler) redditScope(w http.ResponseWriter, r *http.Request, admin bool) (ws, user, task string, ok bool) {
	if h.Reddit == nil {
		writeError(w, 503, "reddit_not_configured")
		return
	}
	user, ok = requireUserID(w, r)
	if !ok {
		return
	}
	ws = h.resolveWorkspaceID(r)
	if _, ok = parseUUIDOrBadRequest(w, ws, "workspace id"); !ok {
		return
	}
	member, allowed := h.workspaceMember(w, r, ws)
	if !allowed {
		ok = false
		return
	}
	source := r.Header.Get("X-Actor-Source")
	if source != "" && source != "task_token" {
		writeError(w, 403, "invalid_actor")
		ok = false
		return
	}
	if admin && (source != "" || !roleAllowed(member.Role, "owner", "admin")) {
		writeError(w, 403, "human_admin_required")
		ok = false
		return
	}
	if source == "task_token" {
		task = r.Header.Get("X-Task-ID")
		var parsedOK bool
		id, parsedOK := parseUUIDOrBadRequest(w, task, "task id")
		if !parsedOK {
			ok = false
			return
		}
		_, err := h.Queries.GetAgentTaskInWorkspace(r.Context(), db.GetAgentTaskInWorkspaceParams{ID: id, WorkspaceID: parseUUID(ws)})
		if err != nil {
			writeError(w, 403, "invalid_task_scope")
			ok = false
			return
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	ok = true
	return
}
func redditError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, reddit.ErrInvalid):
		writeError(w, 400, "reddit_invalid_request")
	case errors.Is(err, reddit.ErrConflict):
		writeError(w, 409, "reddit_review_required")
	case errors.Is(err, reddit.ErrPermission):
		writeError(w, 403, "reddit_permission_required")
	case errors.Is(err, reddit.ErrRateLimited):
		w.Header().Set("Retry-After", "120")
		writeError(w, 429, "reddit_rate_limited")
	case errors.Is(err, pgx.ErrNoRows), errors.Is(err, reddit.ErrUnavailable), errors.Is(err, reddit.ErrContentRemoved):
		writeError(w, 404, "reddit_content_unavailable")
	default:
		writeError(w, 502, "reddit_request_failed")
	}
}
func redditDecode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if d.Decode(v) != nil {
		writeError(w, 400, "invalid_request")
		return false
	}
	return true
}
func (h *Handler) RedditConnections(w http.ResponseWriter, r *http.Request) {
	if h.Reddit == nil {
		writeJSON(w, 200, map[string]any{"configured": false, "connections": []any{}})
		return
	}
	ws, _, _, ok := h.redditScope(w, r, false)
	if !ok {
		return
	}
	rows, err := h.Reddit.Connections(r.Context(), ws)
	if err != nil {
		redditError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"configured": true, "connections": rows})
}
func (h *Handler) RedditConnect(w http.ResponseWriter, r *http.Request) {
	ws, user, _, ok := h.redditScope(w, r, true)
	if !ok {
		return
	}
	var in struct {
		ConnectionID string `json:"connection_id"`
		CanReply     bool   `json:"can_reply"`
	}
	if !redditDecode(w, r, &in) {
		return
	}
	if in.ConnectionID != "" {
		if _, ok = parseUUIDOrBadRequest(w, in.ConnectionID, "connection id"); !ok {
			return
		}
	}
	u, err := h.Reddit.Begin(r.Context(), ws, user, in.ConnectionID, in.CanReply)
	if err != nil {
		redditError(w, err)
		return
	}
	writeJSON(w, 200, map[string]string{"url": u})
}
func (h *Handler) RedditCallback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
	w.Header().Set("Referrer-Policy", "no-referrer")
	if h.Reddit == nil {
		writeError(w, 503, "reddit_not_configured")
		return
	}
	if err := h.Reddit.Complete(r.Context(), r.URL.Query().Get("state"), r.URL.Query().Get("code")); err != nil {
		redditError(w, err)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("Reddit connected. You can close this tab and return to iteamify.\nReddit 已连接，请关闭此页面并返回 iteamify。"))
}
func (h *Handler) RedditDisconnect(w http.ResponseWriter, r *http.Request) {
	ws, _, _, ok := h.redditScope(w, r, true)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if _, ok = parseUUIDOrBadRequest(w, id, "connection id"); !ok {
		return
	}
	if err := h.Reddit.Disconnect(r.Context(), ws, id); err != nil {
		redditError(w, err)
		return
	}
	w.WriteHeader(204)
}
func (h *Handler) RedditRead(w http.ResponseWriter, r *http.Request) {
	ws, _, _, ok := h.redditScope(w, r, false)
	if !ok {
		return
	}
	q := r.URL.Query()
	id := q.Get("connection_id")
	if _, ok = parseUUIDOrBadRequest(w, id, "connection id"); !ok {
		return
	}
	limit := 25
	if v := q.Get("limit"); v != "" {
		n, e := strconv.Atoi(v)
		if e != nil {
			redditError(w, reddit.ErrInvalid)
			return
		}
		limit = n
	}
	var page reddit.Page
	var err error
	if strings.HasSuffix(r.URL.Path, "/search") {
		page, err = h.Reddit.Search(r.Context(), ws, id, q.Get("subreddit"), q.Get("query"), q.Get("after"), limit)
	} else {
		page, err = h.Reddit.Thread(r.Context(), ws, id, q.Get("fullname"), limit)
	}
	if err != nil {
		redditError(w, err)
		return
	}
	writeJSON(w, 200, page)
}
func (h *Handler) RedditDrafts(w http.ResponseWriter, r *http.Request) {
	ws, _, _, ok := h.redditScope(w, r, false)
	if !ok {
		return
	}
	rows, err := h.Reddit.Drafts(r.Context(), ws)
	if err != nil {
		redditError(w, err)
		return
	}
	writeJSON(w, 200, rows)
}
func (h *Handler) RedditSaveDraft(w http.ResponseWriter, r *http.Request) {
	ws, user, task, ok := h.redditScope(w, r, false)
	if !ok {
		return
	}
	var in reddit.DraftInput
	if !redditDecode(w, r, &in) {
		return
	}
	if _, ok = parseUUIDOrBadRequest(w, in.ConnectionID, "connection id"); !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if id != "" {
		if _, ok = parseUUIDOrBadRequest(w, id, "draft id"); !ok {
			return
		}
	}
	d, err := h.Reddit.SaveDraft(r.Context(), ws, user, task, id, in)
	if err != nil {
		redditError(w, err)
		return
	}
	writeJSON(w, 200, d)
}
func (h *Handler) RedditDraftAction(w http.ResponseWriter, r *http.Request) {
	ws, user, _, ok := h.redditScope(w, r, true)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if _, ok = parseUUIDOrBadRequest(w, id, "draft id"); !ok {
		return
	}
	var in struct {
		ExpectedVersion int    `json:"expected_version"`
		Fullname        string `json:"fullname"`
	}
	if !redditDecode(w, r, &in) {
		return
	}
	if in.ExpectedVersion < 1 {
		redditError(w, reddit.ErrInvalid)
		return
	}
	var d reddit.Draft
	var err error
	switch chi.URLParam(r, "action") {
	case "approve":
		d, err = h.Reddit.Queue(r.Context(), ws, user, id, in.ExpectedVersion)
	case "cancel":
		err = h.Reddit.Cancel(r.Context(), ws, id, in.ExpectedVersion)
		if err == nil {
			w.WriteHeader(204)
			return
		}
	case "verify":
		d, err = h.Reddit.Verify(r.Context(), ws, id, in.Fullname, in.ExpectedVersion)
	default:
		writeError(w, 404, "not_found")
		return
	}
	if err != nil {
		redditError(w, err)
		return
	}
	writeJSON(w, 200, d)
}
