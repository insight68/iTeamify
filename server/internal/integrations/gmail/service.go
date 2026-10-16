package gmail

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/iteamify-ai/iteamify/server/internal/storage"
	"github.com/iteamify-ai/iteamify/server/internal/util"
	"github.com/iteamify-ai/iteamify/server/internal/util/secretbox"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
)

const googleAuthorizationURL = "https://accounts.google.com/o/oauth2/v2/auth"

type Service struct {
	queries      *db.Queries
	pool         *pgxpool.Pool
	box          *secretbox.Box
	config       Config
	api          *apiClient
	verifier     *oidcVerifier
	now          func() time.Time
	syncWake     chan struct{}
	analysisWake chan struct{}
	model        TextModel
	notifier     AnalysisNotifier
	startOnce    sync.Once
	workerWG     sync.WaitGroup
	storage      storage.Storage
}

func (s *Service) Start(ctx context.Context) {
	s.startOnce.Do(func() {
		s.workerWG.Add(2)
		go func() {
			defer s.workerWG.Done()
			s.runOutbound(ctx)
		}()
		go func() {
			defer s.workerWG.Done()
			s.Run(ctx)
		}()
	})
}

func (s *Service) WaitWithTimeout(timeout time.Duration) bool {
	done := make(chan struct{})
	go func() {
		s.workerWG.Wait()
		close(done)
	}()
	select {
	case <-done:
		return true
	case <-time.After(timeout):
		return false
	}
}

func NewService(queries *db.Queries, pool *pgxpool.Pool, box *secretbox.Box, config Config, transport http.RoundTripper) (*Service, error) {
	if queries == nil || pool == nil || box == nil {
		return nil, errors.New("gmail: service requires queries, pool, and secretbox")
	}
	config.ClientID = strings.TrimSpace(config.ClientID)
	config.ClientSecret = strings.TrimSpace(config.ClientSecret)
	config.CallbackURL = strings.TrimRight(strings.TrimSpace(config.CallbackURL), "/")
	config.FrontendURL = strings.TrimRight(strings.TrimSpace(config.FrontendURL), "/")
	config.PubSubTopic = strings.TrimSpace(config.PubSubTopic)
	config.PushAudience = strings.TrimSpace(config.PushAudience)
	config.PushServiceAccount = strings.ToLower(strings.TrimSpace(config.PushServiceAccount))
	config.PushVerificationToken = strings.TrimSpace(config.PushVerificationToken)
	if !config.OAuthEnabled() {
		return nil, ErrNotConfigured
	}
	if config.OAuthStateTTL <= 0 {
		config.OAuthStateTTL = 10 * time.Minute
	}
	if config.PollInterval <= 0 {
		config.PollInterval = 5 * time.Minute
	}
	if config.HTTPTimeout <= 0 {
		config.HTTPTimeout = 30 * time.Second
	}
	service := &Service{
		queries:      queries,
		pool:         pool,
		box:          box,
		config:       config,
		now:          time.Now,
		syncWake:     make(chan struct{}, gmailSyncWorkerCount),
		analysisWake: make(chan struct{}, gmailAnalysisWorkerCount),
	}
	service.api = newAPIClient(config, box, transport)
	if config.PushAudience != "" && config.PushServiceAccount != "" {
		service.verifier = newOIDCVerifier(config.PushAudience, config.PushServiceAccount, transport)
	}
	return service, nil
}

func (s *Service) BeginConnect(ctx context.Context, userID, workspaceID pgtype.UUID, returnPath string) (string, error) {
	if !userID.Valid || !workspaceID.Valid {
		return "", errors.New("gmail: invalid connection owner or workspace")
	}
	stateBytes := make([]byte, 32)
	if _, err := rand.Read(stateBytes); err != nil {
		return "", fmt.Errorf("gmail: generate oauth state: %w", err)
	}
	state := base64.RawURLEncoding.EncodeToString(stateBytes)
	hash := sha256.Sum256([]byte(state))
	if err := s.queries.CreateGmailOAuthState(ctx, db.CreateGmailOAuthStateParams{
		StateHash:   hash[:],
		UserID:      userID,
		WorkspaceID: workspaceID,
		ReturnPath:  sanitizeReturnPath(returnPath),
		ExpiresAt:   pgtype.Timestamptz{Time: s.now().Add(s.config.OAuthStateTTL), Valid: true},
	}); err != nil {
		return "", fmt.Errorf("gmail: persist oauth state: %w", err)
	}

	params := url.Values{
		"client_id":              {s.config.ClientID},
		"redirect_uri":           {s.config.CallbackURL},
		"response_type":          {"code"},
		"scope":                  {gmailReadonlyScope + " " + gmailSendScope},
		"access_type":            {"offline"},
		"prompt":                 {"consent select_account"},
		"include_granted_scopes": {"true"},
		"state":                  {state},
	}
	return googleAuthorizationURL + "?" + params.Encode(), nil
}

func (s *Service) CompleteOAuth(ctx context.Context, state, code string) (OAuthResult, error) {
	hash := sha256.Sum256([]byte(strings.TrimSpace(state)))
	stateRow, err := s.queries.ConsumeGmailOAuthState(ctx, hash[:])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return OAuthResult{}, ErrInvalidOAuthState
		}
		return OAuthResult{}, fmt.Errorf("gmail: consume oauth state: %w", err)
	}
	if strings.TrimSpace(code) == "" {
		return OAuthResult{ReturnPath: stateRow.ReturnPath}, errors.New("gmail: callback missing code")
	}

	tokens, err := s.api.exchangeCode(ctx, code)
	if err != nil {
		return OAuthResult{ReturnPath: stateRow.ReturnPath}, err
	}
	if !hasRequiredScopes(strings.Fields(tokens.Scope)) {
		return OAuthResult{ReturnPath: stateRow.ReturnPath, ErrorCode: "scopes_required"}, ErrSendPermission
	}
	profile, err := s.api.profile(ctx, tokens.AccessToken)
	if err != nil {
		return OAuthResult{ReturnPath: stateRow.ReturnPath}, fmt.Errorf("gmail: load profile: %w", err)
	}
	emailAddress := strings.ToLower(strings.TrimSpace(profile.EmailAddress))
	if emailAddress == "" {
		return OAuthResult{ReturnPath: stateRow.ReturnPath}, errors.New("gmail: profile missing email address")
	}

	var ciphertext []byte
	if tokens.RefreshToken != "" {
		ciphertext, err = s.box.Seal([]byte(tokens.RefreshToken))
		if err != nil {
			return OAuthResult{ReturnPath: stateRow.ReturnPath}, fmt.Errorf("gmail: seal refresh token: %w", err)
		}
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return OAuthResult{ReturnPath: stateRow.ReturnPath}, fmt.Errorf("gmail: begin connection transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := s.queries.WithTx(tx)
	if _, err := queries.LockGmailBindingScope(ctx, db.LockGmailBindingScopeParams{
		WorkspaceID: stateRow.WorkspaceID, UserID: stateRow.UserID,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return OAuthResult{ReturnPath: stateRow.ReturnPath}, errors.New("gmail: workspace access is no longer available")
		}
		return OAuthResult{ReturnPath: stateRow.ReturnPath}, fmt.Errorf("gmail: lock workspace membership: %w", err)
	}
	if len(ciphertext) == 0 {
		existing, getErr := queries.GetUserGmailConnectionByEmail(ctx, db.GetUserGmailConnectionByEmailParams{
			UserID:       stateRow.UserID,
			EmailAddress: emailAddress,
		})
		if getErr != nil {
			return OAuthResult{ReturnPath: stateRow.ReturnPath}, errors.New("gmail: Google did not return an offline refresh token; revoke access and try again")
		}
		ciphertext = existing.RefreshTokenCiphertext
	}

	scopes := strings.Fields(tokens.Scope)
	connection, err := queries.UpsertUserGmailConnection(ctx, db.UpsertUserGmailConnectionParams{
		UserID:                 stateRow.UserID,
		EmailAddress:           emailAddress,
		RefreshTokenCiphertext: ciphertext,
		GrantedScopes:          scopes,
		HistoryID:              optionalText(profile.HistoryID),
	})
	if err != nil {
		return OAuthResult{ReturnPath: stateRow.ReturnPath}, fmt.Errorf("gmail: save connection: %w", err)
	}
	if _, err := queries.UpsertGmailAnalysisBinding(ctx, db.UpsertGmailAnalysisBindingParams{
		ConnectionID:    connection.ID,
		WorkspaceID:     stateRow.WorkspaceID,
		RecipientUserID: stateRow.UserID,
	}); err != nil {
		return OAuthResult{ReturnPath: stateRow.ReturnPath}, fmt.Errorf("gmail: save analysis binding: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return OAuthResult{ReturnPath: stateRow.ReturnPath}, fmt.Errorf("gmail: commit connection: %w", err)
	}
	s.api.rememberAccessToken(connection.ID, tokens.AccessToken, tokens.ExpiresIn)

	// Push delivery is an optimization, not a connection prerequisite. A
	// deployment without Pub/Sub still receives mail through the five-minute
	// history poller, which keeps the novice setup path to OAuth-only.
	if s.config.PushEnabled() {
		watch, watchErr := s.api.watch(ctx, tokens.AccessToken)
		if watchErr == nil {
			expiration, parseErr := watchExpiration(watch.Expiration)
			if parseErr == nil {
				_ = s.queries.UpdateGmailConnectionWatch(ctx, db.UpdateGmailConnectionWatchParams{
					ID: connection.ID, WatchExpiration: expiration,
				})
			} else {
				_ = s.queries.MarkGmailConnectionAttention(ctx, db.MarkGmailConnectionAttentionParams{
					ID: connection.ID, LastErrorCode: optionalText("watch_response_invalid"),
				})
			}
		} else {
			_ = s.queries.MarkGmailConnectionAttention(ctx, db.MarkGmailConnectionAttentionParams{
				ID: connection.ID, LastErrorCode: optionalText("watch_setup_failed"),
			})
		}
	}

	// Establish the cursor and verify the asynchronous path immediately. The
	// first sync sees no historical flood because history_id is the connection
	// time baseline.
	_, _ = s.queries.UpsertGmailSyncJob(ctx, db.UpsertGmailSyncJobParams{
		ConnectionID: connection.ID, TargetHistoryID: optionalText(profile.HistoryID),
	})
	s.signalSyncWorkers()
	return OAuthResult{
		ConnectionID: util.UUIDToString(connection.ID),
		EmailAddress: emailAddress,
		ReturnPath:   stateRow.ReturnPath,
	}, nil
}

func (s *Service) ListConnections(ctx context.Context, userID, workspaceID pgtype.UUID) ([]Connection, error) {
	rows, err := s.queries.ListUserGmailConnections(ctx, db.ListUserGmailConnectionsParams{
		UserID: userID, WorkspaceID: workspaceID,
	})
	if err != nil {
		return nil, err
	}
	result := make([]Connection, 0, len(rows))
	for _, row := range rows {
		view := Connection{
			CanSend:         row.Status == "active" && hasRequiredScopes(row.GrantedScopes),
			ID:              util.UUIDToString(row.ID),
			EmailAddress:    row.EmailAddress,
			Status:          row.Status,
			AnalysisEnabled: row.AnalysisEnabled,
			MessageCount:    row.MessageCount,
			AnalyzedCount:   row.AnalyzedCount,
			ConnectedAt:     row.ConnectedAt.Time,
		}
		if row.LastSyncAt.Valid {
			value := row.LastSyncAt.Time
			view.LastSyncAt = &value
		}
		if row.WatchExpiration.Valid {
			value := row.WatchExpiration.Time
			view.WatchExpiration = &value
		}
		if row.LastErrorCode.Valid {
			value := row.LastErrorCode.String
			view.LastErrorCode = &value
		}
		result = append(result, view)
	}
	return result, nil
}

func (s *Service) AnalysisConfigured() bool {
	return s.model != nil && s.model.Enabled() && s.notifier != nil
}

func (s *Service) PushConfigured() bool { return s.config.PushEnabled() }

func (s *Service) Disconnect(ctx context.Context, userID, connectionID pgtype.UUID) error {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := s.queries.WithTx(tx)
	connection, err := queries.LockOwnedGmailConnection(ctx, db.LockOwnedGmailConnectionParams{ID: connectionID, UserID: userID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrConnectionNotFound
		}
		return err
	}
	if err := queries.DeleteGmailConnectionChildren(ctx, db.DeleteGmailConnectionChildrenParams{
		TargetConnectionID: connectionID, ConnectionIDText: util.UUIDToString(connectionID),
	}); err != nil {
		return err
	}
	rows, err := queries.DeleteGmailConnection(ctx, connectionID)
	if err != nil {
		return err
	}
	if rows != 1 {
		return ErrConnectionNotFound
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}

	// Local deletion is the authoritative privacy boundary. Google cleanup is
	// best-effort after it, so an upstream outage cannot retain copied mail.
	// Bound the request tail: revocation is external cleanup, not the local
	// deletion commit, and an expired watch can only enqueue a no-op afterward.
	s.api.forget(connectionID)
	cleanupCtx, cancelCleanup := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancelCleanup()
	if revokeErr := s.api.revoke(cleanupCtx, connection); revokeErr != nil {
		slog.Warn("gmail: revoke authorization after disconnect failed", "connection_id", util.UUIDToString(connectionID), "error", revokeErr)
	}
	return nil
}

func (s *Service) SetAnalysisEnabled(ctx context.Context, userID, connectionID, workspaceID pgtype.UUID, enabled bool) error {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := s.queries.WithTx(tx)
	if _, err := queries.LockGmailBindingScope(ctx, db.LockGmailBindingScopeParams{
		WorkspaceID: workspaceID, UserID: userID,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrConnectionNotFound
		}
		return err
	}
	if _, err := queries.GetOwnedGmailConnection(ctx, db.GetOwnedGmailConnectionParams{ID: connectionID, UserID: userID}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrConnectionNotFound
		}
		return err
	}
	binding, err := queries.GetGmailAnalysisBindingForWorkspace(ctx, db.GetGmailAnalysisBindingForWorkspaceParams{
		ConnectionID: connectionID, WorkspaceID: workspaceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		binding, err = queries.UpsertGmailAnalysisBinding(ctx, db.UpsertGmailAnalysisBindingParams{
			ConnectionID: connectionID, WorkspaceID: workspaceID, RecipientUserID: userID,
		})
	}
	if err != nil {
		return err
	}
	if binding.Enabled == enabled {
		return tx.Commit(ctx)
	}
	_, err = queries.UpdateOwnedGmailAnalysisBinding(ctx, db.UpdateOwnedGmailAnalysisBindingParams{
		ID: binding.ID, UserID: userID, Enabled: enabled, NotifyThreshold: binding.NotifyThreshold,
	})
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) CallbackRedirect(result OAuthResult, success bool) string {
	base := result.ReturnPath
	if base == "" {
		base = "/connections"
	}
	parsed, _ := url.Parse(base)
	query := parsed.Query()
	if success {
		query.Set("gmail_connected", result.ConnectionID)
		query.Del("gmail_error")
	} else {
		query.Set("gmail_error", "connect_failed")
		if result.ErrorCode != "" {
			query.Set("gmail_error", result.ErrorCode)
		}
		query.Del("gmail_connected")
	}
	parsed.RawQuery = query.Encode()
	if s.config.FrontendURL == "" {
		return parsed.String()
	}
	return s.config.FrontendURL + parsed.String()
}

func (s *Service) VerifyPushRequest(ctx context.Context, request *http.Request) error {
	if token := s.config.PushVerificationToken; token != "" {
		provided := request.URL.Query().Get("token")
		if len(provided) != len(token) || subtle.ConstantTimeCompare([]byte(provided), []byte(token)) != 1 {
			return ErrPushUnauthorized
		}
		return nil
	}
	if s.verifier == nil {
		return ErrPushUnauthorized
	}
	authorization := strings.TrimSpace(request.Header.Get("Authorization"))
	if !strings.HasPrefix(strings.ToLower(authorization), "bearer ") {
		return ErrPushUnauthorized
	}
	if err := s.verifier.Verify(ctx, strings.TrimSpace(authorization[7:])); err != nil {
		return ErrPushUnauthorized
	}
	return nil
}

func DecodePush(envelope PushEnvelope) (PushData, error) {
	raw, err := base64.StdEncoding.DecodeString(envelope.Message.Data)
	if err != nil {
		return PushData{}, fmt.Errorf("gmail: decode push data: %w", err)
	}
	var data PushData
	if err := json.Unmarshal(raw, &data); err != nil {
		return PushData{}, fmt.Errorf("gmail: parse push data: %w", err)
	}
	data.EmailAddress = strings.ToLower(strings.TrimSpace(data.EmailAddress))
	data.HistoryID = strings.TrimSpace(data.HistoryID)
	if data.EmailAddress == "" || data.HistoryID == "" {
		return PushData{}, errors.New("gmail: push data missing emailAddress or historyId")
	}
	return data, nil
}

func (s *Service) EnqueuePush(ctx context.Context, data PushData) (int, error) {
	connectionIDs, err := s.queries.EnqueueGmailPushByEmail(ctx, db.EnqueueGmailPushByEmailParams{
		EmailAddress: data.EmailAddress, TargetHistoryID: optionalText(data.HistoryID),
	})
	if err != nil {
		return 0, err
	}
	if len(connectionIDs) > 0 {
		s.signalSyncWorkers()
	}
	return len(connectionIDs), nil
}

func (s *Service) signalSyncWorkers() {
	signalWorkers(s.syncWake, gmailSyncWorkerCount)
}

func (s *Service) signalAnalysisWorkers() {
	signalWorkers(s.analysisWake, gmailAnalysisWorkerCount)
}

func signalWorkers(wake chan struct{}, count int) {
	for i := 0; i < count; i++ {
		select {
		case wake <- struct{}{}:
		default:
			return
		}
	}
}

func optionalText(value string) pgtype.Text {
	value = strings.TrimSpace(value)
	return pgtype.Text{String: value, Valid: value != ""}
}

func sanitizeReturnPath(value string) string {
	value = strings.TrimSpace(value)
	parsed, err := url.Parse(value)
	if err != nil || parsed.IsAbs() || parsed.Host != "" || !strings.HasPrefix(parsed.Path, "/") || strings.HasPrefix(parsed.Path, "//") {
		return "/connections"
	}
	return parsed.String()
}
