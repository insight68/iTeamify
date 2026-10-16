package reddit

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/iteamify-ai/iteamify/server/internal/util/secretbox"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrInvalid        = errors.New("invalid Reddit request")
	ErrConflict       = errors.New("Reddit draft or connection changed; reload and review again")
	ErrPermission     = errors.New("Reddit permission required")
	ErrRateLimited    = errors.New("Reddit request budget exhausted; try again later")
	ErrContentRemoved = errors.New("Reddit content was removed")
	ErrUnavailable    = errors.New("Reddit content unavailable or outside public community scope")
)

type WorkspaceConfig struct{ ClientID, ClientSecret, CallbackURL, UserAgent string }
type WorkspaceService struct {
	pool               *pgxpool.Pool
	box                *secretbox.Box
	config             WorkspaceConfig
	http               *http.Client
	apiHost, oauthHost string
}
type Connection struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	CanReply bool   `json:"can_reply"`
	Status   string `json:"status"`
}

func NewWorkspaceService(pool *pgxpool.Pool, box *secretbox.Box, cfg WorkspaceConfig) (*WorkspaceService, error) {
	u, e := url.Parse(cfg.CallbackURL)
	if pool == nil || box == nil || cfg.ClientID == "" || cfg.ClientSecret == "" || cfg.UserAgent == "" || e != nil || u.Host == "" || (u.Scheme != "https" && u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1") {
		return nil, ErrInvalid
	}
	return &WorkspaceService{pool: pool, box: box, config: cfg, http: &http.Client{Timeout: 20 * time.Second}, apiHost: redditAPIBase, oauthHost: redditOAuthHost}, nil
}

func (s *WorkspaceService) Connections(ctx context.Context, ws string) ([]Connection, error) {
	rows, err := s.pool.Query(ctx, `SELECT id::text,username,can_reply,status FROM reddit_connection WHERE workspace_id=$1 ORDER BY created_at`, ws)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Connection{}
	for rows.Next() {
		var c Connection
		if err = rows.Scan(&c.ID, &c.Username, &c.CanReply, &c.Status); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *WorkspaceService) Begin(ctx context.Context, ws, user, id string, reply bool) (string, error) {
	if id != "" {
		var found bool
		err := s.pool.QueryRow(ctx, `SELECT true FROM reddit_connection WHERE workspace_id=$1 AND id=$2`, ws, id).Scan(&found)
		if err != nil {
			return "", err
		}
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	state := base64.RawURLEncoding.EncodeToString(b)
	hash := sha256.Sum256([]byte(state))
	_, err := s.pool.Exec(ctx, `INSERT INTO reddit_oauth_state(state_hash,workspace_id,user_id,connection_id,can_reply) VALUES($1,$2,$3,NULLIF($4,'')::uuid,$5)`, hash[:], ws, user, id, reply)
	if err != nil {
		return "", err
	}
	scope := "identity read"
	if reply {
		scope += " submit"
	}
	q := url.Values{"client_id": {s.config.ClientID}, "response_type": {"code"}, "state": {state}, "redirect_uri": {s.config.CallbackURL}, "duration": {"permanent"}, "scope": {scope}}
	return s.oauthHost + "/api/v1/authorize?" + q.Encode(), nil
}

// OAuth state is consumed once, including denial. Membership is checked again
// inside the installation transaction so a removed admin cannot finish connecting.
func (s *WorkspaceService) Complete(ctx context.Context, state, code string) (err error) {
	hash := sha256.Sum256([]byte(state))
	var ws, user, id string
	var reply bool
	err = s.pool.QueryRow(ctx, `DELETE FROM reddit_oauth_state WHERE state_hash=$1 AND expires_at>now() RETURNING workspace_id::text,user_id::text,COALESCE(connection_id::text,''),can_reply`, hash[:]).Scan(&ws, &user, &id, &reply)
	if err != nil {
		return ErrPermission
	}
	if code == "" {
		return ErrPermission
	}
	form := url.Values{"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {s.config.CallbackURL}}
	req, _ := http.NewRequestWithContext(ctx, "POST", s.oauthHost+tokenEndpoint, strings.NewReader(form.Encode()))
	req.SetBasicAuth(s.config.ClientID, s.config.ClientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", s.config.UserAgent)
	resp, err := s.http.Do(req)
	if err != nil {
		return errors.New("Reddit authorization exchange failed")
	}
	defer resp.Body.Close()
	var token tokenResponse
	if resp.StatusCode != 200 || json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&token) != nil || token.AccessToken == "" || token.RefreshToken == "" || !hasScopes(token.Scope, reply) {
		return ErrPermission
	}
	client := s.tokenClient(token.RefreshToken)
	client.cachedToken = token.AccessToken
	client.tokenExpiry = time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)
	var me struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err = readJSON(ctx, client, "/api/v1/me", &me); err != nil {
		return err
	}
	if me.ID == "" || me.Name == "" {
		return ErrPermission
	}
	sealed, err := s.box.Seal([]byte(token.RefreshToken))
	if err != nil {
		return err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var role string
	if err = tx.QueryRow(ctx, `SELECT role FROM member WHERE workspace_id=$1 AND user_id=$2 FOR SHARE`, ws, user).Scan(&role); err != nil || (role != "owner" && role != "admin") {
		return ErrPermission
	}
	if id != "" {
		var account string
		if err = tx.QueryRow(ctx, `SELECT reddit_user_id FROM reddit_connection WHERE workspace_id=$1 AND id=$2 FOR UPDATE`, ws, id).Scan(&account); err != nil {
			return err
		}
		if account != me.ID {
			return ErrConflict
		}
	}
	_, err = tx.Exec(ctx, `INSERT INTO reddit_connection(workspace_id,user_id,reddit_user_id,username,refresh_token,scopes,can_reply) VALUES($1,$2,$3,$4,$5,$6,$7)
 ON CONFLICT(workspace_id,reddit_user_id) DO UPDATE SET user_id=EXCLUDED.user_id,username=EXCLUDED.username,refresh_token=EXCLUDED.refresh_token,scopes=EXCLUDED.scopes,can_reply=EXCLUDED.can_reply,status='active',updated_at=now()`, ws, user, me.ID, me.Name, sealed, token.Scope, reply)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func hasScopes(scope string, reply bool) bool {
	scopes := strings.Fields(strings.ReplaceAll(scope, ",", " "))
	m := map[string]bool{}
	for _, x := range scopes {
		m[x] = true
	}
	return m["*"] || (m["identity"] && m["read"] && (!reply || m["submit"]))
}

func (s *WorkspaceService) tokenClient(refresh string) *oauthClient {
	c := newOAuthClient(s.config.ClientID, s.config.ClientSecret, refresh, s.config.UserAgent)
	c.httpClient = s.http
	c.APIHost = s.apiHost
	c.OAuthHost = s.oauthHost
	c.beforeRequest = s.takeBudget
	c.afterResponse = s.observeBudget
	return c
}
func (s *WorkspaceService) client(ctx context.Context, ws, id string, write bool) (*oauthClient, Connection, error) {
	var c Connection
	var encrypted []byte
	var scope string
	err := s.pool.QueryRow(ctx, `SELECT id::text,username,can_reply,status,refresh_token,scopes FROM reddit_connection WHERE workspace_id=$1 AND id=$2 AND status='active'`, ws, id).Scan(&c.ID, &c.Username, &c.CanReply, &c.Status, &encrypted, &scope)
	if err != nil {
		return nil, c, err
	}
	if write && !c.CanReply {
		return nil, c, ErrPermission
	}
	if !hasScopes(scope, write) {
		return nil, c, ErrPermission
	}
	plain, err := s.box.Open(encrypted)
	if err != nil {
		return nil, c, ErrPermission
	}
	client := s.tokenClient(string(plain))
	client.persistRefresh = func(ctx context.Context, refresh string) error {
		b, e := s.box.Seal([]byte(refresh))
		if e != nil {
			return e
		}
		_, e = s.pool.Exec(ctx, `UPDATE reddit_connection SET refresh_token=$3,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND status='active'`, ws, id, b)
		return e
	}
	return client, c, nil
}
func (s *WorkspaceService) Disconnect(ctx context.Context, ws, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	// Refuse disconnect while a request may be in flight; never race token removal with sending.
	var locked string
	if err = tx.QueryRow(ctx, `SELECT id::text FROM reddit_connection WHERE workspace_id=$1 AND id=$2 FOR UPDATE`, ws, id).Scan(&locked); err != nil {
		return err
	}
	var sending bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM reddit_reply_draft WHERE workspace_id=$1 AND connection_id=$2 AND status='sending')`, ws, id).Scan(&sending); err != nil {
		return err
	}
	if sending {
		return ErrConflict
	}
	if _, err = tx.Exec(ctx, `UPDATE reddit_connection SET status='revoked',refresh_token=''::bytea,can_reply=false,updated_at=now() WHERE workspace_id=$1 AND id=$2`, ws, id); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM reddit_reply_draft WHERE workspace_id=$1 AND connection_id=$2`, ws, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Budget reservation is atomic across all nodes, connections and request paths.
func (s *WorkspaceService) takeBudget(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO reddit_request_budget(client_id) VALUES($1) ON CONFLICT DO NOTHING`, s.config.ClientID)
	if err != nil {
		return err
	}
	tag, err := s.pool.Exec(ctx, `UPDATE reddit_request_budget SET remaining=CASE WHEN reset_at<=now() THEN 89 ELSE remaining-1 END,reset_at=CASE WHEN reset_at<=now() THEN now()+interval '1 minute' ELSE reset_at END WHERE client_id=$1 AND blocked_until<=now() AND (remaining>5 OR reset_at<=now())`, s.config.ClientID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrRateLimited
	}
	return nil
}
func (s *WorkspaceService) observeBudget(ctx context.Context, r *http.Response) error {
	var remain, reset float64
	if _, err := fmt.Sscan(r.Header.Get("X-Ratelimit-Remaining"), &remain); err == nil {
		if _, err = fmt.Sscan(r.Header.Get("X-Ratelimit-Reset"), &reset); err == nil && reset >= 0 && reset < 86400 {
			_, err = s.pool.Exec(ctx, `UPDATE reddit_request_budget SET remaining=LEAST(remaining,$2),reset_at=CASE WHEN $2<remaining THEN GREATEST(reset_at,now()+$3*interval '1 second') ELSE reset_at END WHERE client_id=$1`, s.config.ClientID, int(remain), reset)
			if err != nil {
				return err
			}
		}
	}
	if r.StatusCode == 429 {
		delay := time.Minute
		if v := r.Header.Get("Retry-After"); v != "" {
			if d, e := time.ParseDuration(v + "s"); e == nil && d > 0 && d < 24*time.Hour {
				delay = d
			}
		}
		if reset > delay.Seconds() && reset < 86400 {
			delay = time.Duration(reset) * time.Second
		}
		_, err := s.pool.Exec(ctx, `UPDATE reddit_request_budget SET blocked_until=GREATEST(blocked_until,now()+$2*interval '1 second') WHERE client_id=$1`, s.config.ClientID, delay.Seconds())
		return err
	}
	return nil
}

func readJSON(ctx context.Context, c *oauthClient, path string, out any) error {
	resp, err := c.do(ctx, "GET", path, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 429 {
		return ErrRateLimited
	}
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return ErrPermission
	}
	if resp.StatusCode != 200 {
		return ErrUnavailable
	}
	if json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(out) != nil {
		return ErrUnavailable
	}
	return nil
}
