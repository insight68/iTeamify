package reddit

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

type Draft struct {
	ID            string    `json:"id"`
	ConnectionID  string    `json:"connection_id"`
	Username      string    `json:"username"`
	Target        string    `json:"target_fullname"`
	Post          string    `json:"post_fullname"`
	Subreddit     string    `json:"subreddit"`
	TargetVersion string    `json:"target_version"`
	Body          string    `json:"body"`
	Version       int       `json:"version"`
	Status        string    `json:"status"`
	SentFullname  string    `json:"sent_fullname"`
	ErrorCode     string    `json:"error_code"`
	CreatedAt     time.Time `json:"created_at"`
	ExpiresAt     time.Time `json:"expires_at"`
}
type DraftInput struct {
	ConnectionID    string `json:"connection_id"`
	Target          string `json:"target_fullname"`
	TargetVersion   string `json:"target_version"`
	Body            string `json:"body"`
	ExpectedVersion int    `json:"expected_version"`
}

const draftColumns = `d.id::text,d.connection_id::text,c.username,d.target_fullname,d.post_fullname,d.subreddit,d.target_version,d.body,d.version,d.status,d.sent_fullname,d.error_code,d.created_at,d.expires_at`

func scanDraft(row pgx.Row) (Draft, error) {
	var d Draft
	err := row.Scan(&d.ID, &d.ConnectionID, &d.Username, &d.Target, &d.Post, &d.Subreddit, &d.TargetVersion, &d.Body, &d.Version, &d.Status, &d.SentFullname, &d.ErrorCode, &d.CreatedAt, &d.ExpiresAt)
	return d, err
}
func (s *WorkspaceService) Drafts(ctx context.Context, ws string) ([]Draft, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+draftColumns+` FROM reddit_reply_draft d JOIN reddit_connection c ON c.id=d.connection_id AND c.workspace_id=d.workspace_id WHERE d.workspace_id=$1 AND d.expires_at>now() ORDER BY (d.status IN ('pending','queued','sending','failed','unknown')) DESC, d.created_at DESC LIMIT 100`, ws)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Draft{}
	for rows.Next() {
		d, e := scanDraft(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
func (s *WorkspaceService) Draft(ctx context.Context, ws, id string) (Draft, error) {
	return scanDraft(s.pool.QueryRow(ctx, `SELECT `+draftColumns+` FROM reddit_reply_draft d JOIN reddit_connection c ON c.id=d.connection_id AND c.workspace_id=d.workspace_id WHERE d.workspace_id=$1 AND d.id=$2 AND d.expires_at>now()`, ws, id))
}
func validBody(body string) bool {
	return strings.TrimSpace(body) != "" && utf8.ValidString(body) && utf8.RuneCountInString(body) <= 9500
}
func (s *WorkspaceService) SaveDraft(ctx context.Context, ws, user, task, id string, in DraftInput) (Draft, error) {
	if !validBody(in.Body) || !thingPattern.MatchString(in.Target) || in.TargetVersion == "" {
		return Draft{}, ErrInvalid
	}
	c, _, err := s.client(ctx, ws, in.ConnectionID, false)
	if err != nil {
		return Draft{}, err
	}
	target, err := publicTarget(ctx, c, in.Target)
	if err != nil {
		return Draft{}, err
	}
	if !target.CanReply || target.Version != in.TargetVersion {
		return Draft{}, ErrConflict
	}
	if id == "" {
		err = s.pool.QueryRow(ctx, `INSERT INTO reddit_reply_draft(workspace_id,connection_id,requested_by,task_id,target_fullname,post_fullname,subreddit,target_version,body) VALUES($1,$2,$3,NULLIF($4,'')::uuid,$5,$6,$7,$8,$9) RETURNING id::text`, ws, in.ConnectionID, user, task, in.Target, target.Post, target.Subreddit, target.Version, in.Body).Scan(&id)
	} else {
		var tag interface{ RowsAffected() int64 }
		tag, err = s.pool.Exec(ctx, `UPDATE reddit_reply_draft SET connection_id=$3,target_fullname=$4,post_fullname=$5,subreddit=$6,target_version=$7,body=$8,version=version+1,status='pending',approved_by=NULL,approved_at=NULL,approved_version=NULL,error_code='',updated_at=now() WHERE workspace_id=$1 AND id=$2 AND version=$9 AND status IN ('pending','failed') AND expires_at>now()`, ws, id, in.ConnectionID, in.Target, target.Post, target.Subreddit, target.Version, in.Body, in.ExpectedVersion)
		if err == nil && tag.RowsAffected() == 0 {
			return Draft{}, ErrConflict
		}
	}
	if err != nil {
		return Draft{}, err
	}
	return s.Draft(ctx, ws, id)
}
func (s *WorkspaceService) Queue(ctx context.Context, ws, user, id string, version int) (Draft, error) {
	d, err := s.Draft(ctx, ws, id)
	if err != nil {
		return d, err
	}
	if d.Version != version || d.Status != "pending" {
		return d, ErrConflict
	}
	c, _, err := s.client(ctx, ws, d.ConnectionID, true)
	if err != nil {
		return d, err
	}
	target, err := publicTarget(ctx, c, d.Target)
	if err != nil {
		return d, err
	}
	if !target.CanReply || target.Version != d.TargetVersion {
		return d, ErrConflict
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return d, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var conn string
	if err = tx.QueryRow(ctx, `SELECT id::text FROM reddit_connection WHERE workspace_id=$1 AND id=$2 AND status='active' AND can_reply FOR UPDATE`, ws, d.ConnectionID).Scan(&conn); err != nil {
		return d, ErrPermission
	}
	var role string
	if err = tx.QueryRow(ctx, `SELECT role FROM member WHERE workspace_id=$1 AND user_id=$2 FOR SHARE`, ws, user).Scan(&role); err != nil || (role != "owner" && role != "admin") {
		return d, ErrPermission
	}
	var count int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM reddit_reply_draft WHERE workspace_id=$1 AND connection_id=$2 AND approved_at>now()-interval '1 hour' AND status IN ('queued','sending','sent','unknown')`, ws, conn).Scan(&count); err != nil {
		return d, err
	}
	if count >= 10 {
		return d, ErrRateLimited
	}
	var duplicate bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM reddit_reply_draft WHERE workspace_id=$1 AND connection_id=$2 AND target_fullname=$3 AND body=$4 AND id<>$5 AND status IN ('queued','sending','sent','unknown'))`, ws, conn, d.Target, d.Body, id).Scan(&duplicate); err != nil {
		return d, err
	}
	if duplicate {
		return d, ErrConflict
	}
	tag, err := tx.Exec(ctx, `UPDATE reddit_reply_draft SET status='queued',approved_by=$3,approved_at=now(),approved_version=version,available_at=now(),updated_at=now() WHERE workspace_id=$1 AND id=$2 AND version=$4 AND status='pending' AND expires_at>now()`, ws, id, user, version)
	if err != nil {
		return d, err
	}
	if tag.RowsAffected() != 1 {
		return d, ErrConflict
	}
	if err = tx.Commit(ctx); err != nil {
		return d, err
	}
	return s.Draft(ctx, ws, id)
}
func (s *WorkspaceService) Cancel(ctx context.Context, ws, id string, version int) error {
	tag, err := s.pool.Exec(ctx, `UPDATE reddit_reply_draft SET status='cancelled',body='',updated_at=now() WHERE workspace_id=$1 AND id=$2 AND version=$3 AND status IN ('pending','queued','failed')`, ws, id, version)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrConflict
	}
	return nil
}

// Verify requires an actual Reddit receipt, not a human assertion of success.
// It never resends an unknown submission.
func (s *WorkspaceService) Verify(ctx context.Context, ws, id, fullname string, version int) (Draft, error) {
	d, err := s.Draft(ctx, ws, id)
	if err != nil {
		return d, err
	}
	if d.Version != version || d.Status != "unknown" || !strings.HasPrefix(fullname, "t1_") {
		return d, ErrConflict
	}
	c, conn, err := s.client(ctx, ws, d.ConnectionID, false)
	if err != nil {
		return d, err
	}
	item, err := publicTarget(ctx, c, fullname)
	if err != nil {
		return d, err
	}
	if !strings.EqualFold(item.Author, conn.Username) || item.Parent != d.Target || item.Body != d.Body || item.CreatedUTC < float64(d.CreatedAt.Unix()) || item.CreatedUTC > float64(d.ExpiresAt.Unix()) {
		return d, ErrConflict
	}
	tag, err := s.pool.Exec(ctx, `UPDATE reddit_reply_draft SET status='sent',sent_fullname=$3,error_code='',updated_at=now() WHERE workspace_id=$1 AND id=$2 AND status='unknown' AND version=$4`, ws, id, fullname, version)
	if err != nil {
		return d, err
	}
	if tag.RowsAffected() != 1 {
		return d, ErrConflict
	}
	return s.Draft(ctx, ws, id)
}

// Maintenance stores no source snapshots. Draft text and associated target
// metadata expire together, including sent/unknown jobs. OAuth states also expire.
func (s *WorkspaceService) Maintenance(ctx context.Context) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	for _, q := range []string{
		`DELETE FROM reddit_oauth_state WHERE expires_at<=now()`,
		`UPDATE reddit_reply_draft SET status='unknown',error_code='interrupted',updated_at=now() WHERE status='sending' AND lease_until<now()`,
		`DELETE FROM reddit_reply_draft WHERE (expires_at<=now() AND status<>'sending') OR NOT EXISTS(SELECT 1 FROM workspace WHERE id=reddit_reply_draft.workspace_id)`,
		`DELETE FROM reddit_connection WHERE NOT EXISTS(SELECT 1 FROM workspace WHERE id=reddit_connection.workspace_id)`,
	} {
		if _, err = tx.Exec(ctx, q); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *WorkspaceService) ProcessOne(ctx context.Context) (bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var ws, id string
	// Lock the connection as well: approval, disconnection and claims serialize.
	err = tx.QueryRow(ctx, `SELECT d.workspace_id::text,d.id::text FROM reddit_reply_draft d JOIN reddit_connection c ON c.id=d.connection_id AND c.workspace_id=d.workspace_id
 WHERE d.status='queued' AND d.available_at<=now() AND d.expires_at>now() AND c.status='active' AND c.can_reply
 ORDER BY d.available_at LIMIT 1 FOR UPDATE OF c,d SKIP LOCKED`).Scan(&ws, &id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if _, err = tx.Exec(ctx, `UPDATE reddit_reply_draft SET status='sending',attempts=attempts+1,lease_until=now()+interval '3 minutes',updated_at=now() WHERE workspace_id=$1 AND id=$2`, ws, id); err != nil {
		return false, err
	}
	if err = tx.Commit(ctx); err != nil {
		return false, err
	}
	d, err := s.Draft(ctx, ws, id)
	if err != nil {
		return true, err
	}
	outcome, receipt, code := s.deliverDraft(ctx, ws, d)
	// A cancelled run can still persist its receipt. If this fails, the expired
	// lease becomes unknown; no worker ever automatically reclaims sending jobs.
	saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if code == "content_removed" {
		_, err = s.pool.Exec(saveCtx, `DELETE FROM reddit_reply_draft WHERE workspace_id=$1 AND (target_fullname=$2 OR post_fullname=$2)`, ws, d.Target)
		return true, err
	}
	_, err = s.pool.Exec(saveCtx, `UPDATE reddit_reply_draft SET status=$3,sent_fullname=$4,error_code=$5,lease_until=NULL,available_at=now()+interval '2 minutes',updated_at=now() WHERE workspace_id=$1 AND id=$2 AND status='sending'`, ws, id, outcome, receipt, code)
	return true, err
}
func (s *WorkspaceService) deliverDraft(ctx context.Context, ws string, d Draft) (string, string, string) {
	c, conn, err := s.client(ctx, ws, d.ConnectionID, true)
	if err != nil {
		return "failed", "", "connection_unavailable"
	}
	var approved bool
	err = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM reddit_reply_draft d JOIN member m ON m.user_id=d.approved_by AND m.workspace_id=d.workspace_id WHERE d.workspace_id=$1 AND d.id=$2 AND d.approved_version=d.version AND d.expires_at>now() AND m.role IN ('owner','admin'))`, ws, d.ID).Scan(&approved)
	if err != nil || !approved {
		return "failed", "", "approval_unavailable"
	}
	target, err := publicTarget(ctx, c, d.Target)
	if errors.Is(err, ErrContentRemoved) {
		return "cancelled", "", "content_removed"
	}
	if errors.Is(err, ErrRateLimited) {
		return "queued", "", "rate_limited"
	}
	if err != nil {
		return "failed", "", "target_unavailable"
	}
	if target.Version != d.TargetVersion || !target.CanReply {
		return "failed", "", "target_changed"
	}
	receipt, err := submitComment(ctx, c, d.Target, d.Body, conn.Username)
	if err == nil {
		return "sent", receipt, ""
	}
	var rejected *commentRejected
	if errors.As(err, &rejected) {
		if rejected.Code == "RATELIMIT" {
			return "queued", "", "rate_limited"
		}
		return "failed", "", rejected.Code
	}
	// ErrRateLimited is only returned before dispatch by the budget reservation.
	if errors.Is(err, ErrRateLimited) {
		return "queued", "", "rate_limited"
	}
	return "unknown", "", "receipt_unknown"
}

type commentRejected struct{ Code string }

func (e *commentRejected) Error() string { return "Reddit rejected reply: " + e.Code }
func submitComment(ctx context.Context, c *oauthClient, parent, body, username string) (string, error) {
	if !thingPattern.MatchString(parent) || !validBody(body) {
		return "", &commentRejected{Code: "INVALID"}
	}
	resp, err := c.do(ctx, http.MethodPost, apiComment, url.Values{"api_type": {"json"}, "thing_id": {parent}, "text": {body}})
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 429 {
		return "", &commentRejected{Code: "RATELIMIT"}
	}
	if resp.StatusCode == 400 || resp.StatusCode == 401 || resp.StatusCode == 403 {
		return "", &commentRejected{Code: "REJECTED"}
	}
	if resp.StatusCode != 200 {
		return "", errors.New("unknown Reddit submission outcome")
	}
	var env struct {
		JSON *struct {
			Errors [][]string `json:"errors"`
			Data   struct {
				Things []contentThing `json:"things"`
			} `json:"data"`
		} `json:"json"`
	}
	if json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&env) != nil || env.JSON == nil {
		return "", errors.New("invalid Reddit receipt")
	}
	if len(env.JSON.Errors) > 0 {
		if len(env.JSON.Errors[0]) == 0 {
			return "", errors.New("invalid Reddit error")
		}
		code := env.JSON.Errors[0][0]
		switch code {
		case "RATELIMIT", "THREAD_LOCKED", "DELETED_COMMENT", "USER_REQUIRED", "SUBREDDIT_NOEXIST":
		default:
			code = "REJECTED"
		}
		return "", &commentRejected{Code: code}
	}
	for _, t := range env.JSON.Data.Things {
		if t.Kind == "t1" && strings.HasPrefix(t.Data.Name, "t1_") && thingPattern.MatchString(t.Data.Name) && t.Data.ParentID == parent && strings.EqualFold(t.Data.Author, username) {
			return t.Data.Name, nil
		}
	}
	return "", errors.New("missing Reddit comment receipt")
}

// CheckDraftTargets removes draft copies referencing explicitly deleted source
// content. Permission failures and missing/partial listings are not deletion
// evidence. Reads are bounded and each draft is checked at most every six hours.
func (s *WorkspaceService) CheckDraftTargets(ctx context.Context) error {
	rows, err := s.pool.Query(ctx, `SELECT workspace_id::text,id::text,connection_id::text,target_fullname FROM reddit_reply_draft WHERE status<>'sending' AND source_checked_at<now()-interval '6 hours' ORDER BY source_checked_at LIMIT 5`)
	if err != nil {
		return err
	}
	type candidate struct{ ws, id, conn, target string }
	var items []candidate
	for rows.Next() {
		var v candidate
		if err = rows.Scan(&v.ws, &v.id, &v.conn, &v.target); err != nil {
			rows.Close()
			return err
		}
		items = append(items, v)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, v := range items {
		c, _, err := s.client(ctx, v.ws, v.conn, false)
		if err != nil {
			continue
		}
		_, err = publicTarget(ctx, c, v.target)
		if errors.Is(err, ErrRateLimited) {
			return nil
		}
		if errors.Is(err, ErrContentRemoved) {
			if _, e := s.pool.Exec(ctx, `DELETE FROM reddit_reply_draft WHERE workspace_id=$1 AND id=$2 AND status<>'sending'`, v.ws, v.id); e != nil {
				return e
			}
			continue
		}
		if err != nil {
			continue
		}
		if _, err = s.pool.Exec(ctx, `UPDATE reddit_reply_draft SET source_checked_at=now() WHERE workspace_id=$1 AND id=$2`, v.ws, v.id); err != nil {
			return err
		}
	}
	return nil
}
