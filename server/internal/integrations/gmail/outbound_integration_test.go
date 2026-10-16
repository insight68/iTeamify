package gmail

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/iteamify-ai/iteamify/server/internal/util"
	"github.com/iteamify-ai/iteamify/server/internal/util/secretbox"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Explicit opt-in: run migrations first against a disposable local database.
// Never falls back to a developer's normal DATABASE_URL.
func emailFixture(t *testing.T, transport http.RoundTripper) (*Service, OutboundScope, EmailDraft) {
	t.Helper()
	dsn := os.Getenv("GMAIL_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set GMAIL_TEST_DATABASE_URL to a migrated disposable database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	q := db.New(pool)
	box, _ := secretbox.New(make([]byte, 32))
	s, err := NewService(q, pool, box, Config{ClientID: "test-client", ClientSecret: "test-secret", CallbackURL: "https://app.example.test/callback", HTTPTimeout: time.Second}, transport)
	if err != nil {
		t.Fatal(err)
	}
	var p OutboundScope
	var runtimeID, agentID pgtype.UUID
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(pool.QueryRow(ctx, `INSERT INTO "user" (name,email) VALUES ('Email test',gen_random_uuid()::text || '@example.test') RETURNING id`).Scan(&p.UserID))
	must(pool.QueryRow(ctx, `INSERT INTO workspace (name,slug,issue_prefix) VALUES ('Email test',gen_random_uuid()::text,'EML') RETURNING id`).Scan(&p.WorkspaceID))
	_, err = q.CreateMember(ctx, db.CreateMemberParams{WorkspaceID: p.WorkspaceID, UserID: p.UserID, Role: "owner"})
	must(err)
	must(pool.QueryRow(ctx, `INSERT INTO agent_runtime (workspace_id,name,runtime_mode,provider,status,owner_id) VALUES ($1,'Email test','cloud','test','online',$2) RETURNING id`, p.WorkspaceID, p.UserID).Scan(&runtimeID))
	must(pool.QueryRow(ctx, `INSERT INTO agent (workspace_id,name,runtime_mode,runtime_config,runtime_id,visibility,permission_mode,max_concurrent_tasks,owner_id) VALUES ($1,'Email test','cloud','{}',$2,'workspace','public_to',1,$3) RETURNING id`, p.WorkspaceID, runtimeID, p.UserID).Scan(&agentID))
	session, err := q.CreateChatSession(ctx, db.CreateChatSessionParams{WorkspaceID: p.WorkspaceID, AgentID: agentID, CreatorID: p.UserID})
	must(err)
	p.ChatSessionID = session.ID
	p.TaskID = util.MustParseUUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
	ciphertext, _ := box.Seal([]byte("test-refresh"))
	connection, err := q.UpsertUserGmailConnection(ctx, db.UpsertUserGmailConnectionParams{UserID: p.UserID, EmailAddress: "sender@example.test", RefreshTokenCiphertext: ciphertext, GrantedScopes: []string{gmailReadonlyScope, gmailSendScope}})
	must(err)
	s.api.rememberAccessToken(connection.ID, "test-token", 3600)
	t.Cleanup(func() {
		_ = q.DeleteGmailConnectionChildren(ctx, db.DeleteGmailConnectionChildrenParams{TargetConnectionID: connection.ID, ConnectionIDText: util.UUIDToString(connection.ID)})
		_, _ = pool.Exec(ctx, `DELETE FROM outbound_email WHERE workspace_id=$1`, p.WorkspaceID)
		_, _ = pool.Exec(ctx, `DELETE FROM gmail_oauth_state WHERE user_id=$1`, p.UserID)
		_, _ = pool.Exec(ctx, `DELETE FROM user_gmail_connection WHERE user_id=$1`, p.UserID)
		_, _ = pool.Exec(ctx, `DELETE FROM workspace WHERE id=$1`, p.WorkspaceID)
		_, _ = pool.Exec(ctx, `DELETE FROM "user" WHERE id=$1`, p.UserID)
	})
	return s, p, EmailDraft{ConnectionID: util.UUIDToString(connection.ID), To: []string{"buyer@example.test"}, Subject: "Quote", Body: "Please review the quote."}
}

func createEmail(t *testing.T, s *Service, p OutboundScope, draft EmailDraft) (OutboundEmail, pgtype.UUID) {
	t.Helper()
	email, err := s.SaveEmailDraft(context.Background(), p, pgtype.UUID{}, 0, draft, false)
	if err != nil {
		t.Fatal(err)
	}
	return email, util.MustParseUUID(email.ID)
}

func TestOutboundIntegrationVersionOwnershipAndSingleSend(t *testing.T) {
	var sent atomic.Int32
	s, p, d := emailFixture(t, emailTransport(func(r *http.Request) (*http.Response, error) {
		sent.Add(1)
		return emailHTTP(200, `{"id":"accepted","threadId":"thread"}`), nil
	}))
	ctx := context.Background()
	email, id := createEmail(t, s, p, d)
	foreign := p
	foreign.UserID = util.MustParseUUID("ffffffff-ffff-4fff-8fff-ffffffffffff")
	if _, err := s.GetEmail(ctx, foreign, id); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("other user read: %v", err)
	}
	foreign = p
	foreign.WorkspaceID = util.MustParseUUID("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")
	if _, err := s.QueueEmail(ctx, foreign, id, 1); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("other workspace send: %v", err)
	}
	d.Subject = "Updated quote"
	email, err := s.SaveEmailDraft(ctx, p, id, email.Version, d, false)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.QueueEmail(ctx, p, id, 1); !errors.Is(err, ErrDraftConflict) {
		t.Fatalf("stale version sent: %v", err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 12)
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			got, err := s.QueueEmail(ctx, p, id, email.Version)
			if err == nil && got.Status != "queued" {
				err = fmt.Errorf("status=%s", got.Status)
			}
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.SaveEmailDraft(ctx, p, id, email.Version, d, false); !errors.Is(err, ErrDraftConflict) {
		t.Fatalf("queued content changed: %v", err)
	}
	claimed, err := s.queries.ClaimOutboundEmail(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.queries.ClaimOutboundEmail(ctx); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("duplicate claim: %v", err)
	}
	s.deliverEmail(ctx, claimed)
	got, err := s.GetEmail(ctx, p, id)
	if err != nil || got.Status != "sent" || got.GmailMessageID != "accepted" || got.SentAt == nil || sent.Load() != 1 {
		t.Fatalf("result=%+v sends=%d err=%v", got, sent.Load(), err)
	}
	if got, err := s.QueueEmail(ctx, p, id, email.Version); err != nil || got.Status != "sent" {
		t.Fatalf("duplicate send result=%+v err=%v", got, err)
	}
}

func TestOutboundIntegrationUnknownIsNeverRetried(t *testing.T) {
	var calls atomic.Int32
	s, p, d := emailFixture(t, emailTransport(func(r *http.Request) (*http.Response, error) { calls.Add(1); return nil, context.DeadlineExceeded }))
	ctx := context.Background()
	email, id := createEmail(t, s, p, d)
	if _, err := s.QueueEmail(ctx, p, id, email.Version); err != nil {
		t.Fatal(err)
	}
	claim, err := s.queries.ClaimOutboundEmail(ctx)
	if err != nil {
		t.Fatal(err)
	}
	s.deliverEmail(ctx, claim)
	got, err := s.GetEmail(ctx, p, id)
	if err != nil || got.Status != "unknown" || calls.Load() != 1 {
		t.Fatalf("got=%+v err=%v calls=%d", got, err, calls.Load())
	}
	if _, err := s.queries.ClaimOutboundEmail(ctx); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("uncertain send requeued: %v", err)
	}
	// A crash after claiming has the same fail-closed outcome, and late workers
	// cannot overwrite it even if they return a successful Gmail response.
	email, id = createEmail(t, s, p, d)
	_, _ = s.QueueEmail(ctx, p, id, email.Version)
	claim, err = s.queries.ClaimOutboundEmail(ctx)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.pool.Exec(ctx, `UPDATE outbound_email SET lease_until=now()-interval '1 second' WHERE id=$1`, id)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.queries.ExpireOutboundEmailClaims(ctx); err != nil {
		t.Fatal(err)
	}
	count, err := s.queries.FinishOutboundEmail(ctx, db.FinishOutboundEmailParams{ID: id, ClaimToken: claim.ClaimToken, Status: "sent", RetryAfter: interval(0)})
	if err != nil || count != 0 {
		t.Fatalf("late worker overwrote outcome: %d %v", count, err)
	}
}

func TestOutboundIntegrationRateLimitIsBounded(t *testing.T) {
	var calls atomic.Int32
	s, p, d := emailFixture(t, emailTransport(func(r *http.Request) (*http.Response, error) {
		calls.Add(1)
		return emailHTTP(403, `{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}`), nil
	}))
	ctx := context.Background()
	email, id := createEmail(t, s, p, d)
	_, err := s.QueueEmail(ctx, p, id, email.Version)
	if err != nil {
		t.Fatal(err)
	}
	for i := 1; i <= 3; i++ {
		_, err = s.pool.Exec(ctx, `UPDATE outbound_email SET available_at=now() WHERE id=$1`, id)
		if err != nil {
			t.Fatal(err)
		}
		claim, err := s.queries.ClaimOutboundEmail(ctx)
		if err != nil {
			t.Fatal(err)
		}
		s.deliverEmail(ctx, claim)
		got, err := s.GetEmail(ctx, p, id)
		if err != nil {
			t.Fatal(err)
		}
		want := "queued"
		if i == 3 {
			want = "failed"
		}
		if got.Status != want {
			t.Fatalf("attempt %d status=%s", i, got.Status)
		}
	}
	if calls.Load() != 3 {
		t.Fatalf("calls=%d", calls.Load())
	}
}

func TestOutboundIntegrationPartialOAuthDoesNotConnect(t *testing.T) {
	var profiles atomic.Int32
	s, p, _ := emailFixture(t, emailTransport(func(r *http.Request) (*http.Response, error) {
		if strings.Contains(r.URL.Path, "profile") {
			profiles.Add(1)
			return emailHTTP(200, `{"emailAddress":"partial@example.test"}`), nil
		}
		return emailHTTP(200, `{"access_token":"partial","refresh_token":"refresh","expires_in":3600,"scope":"`+gmailReadonlyScope+`"}`), nil
	}))
	ctx := context.Background()
	redirect, err := s.BeginConnect(ctx, p.UserID, p.WorkspaceID, "/connections")
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(redirect)
	if !hasRequiredScopes(strings.Fields(u.Query().Get("scope"))) {
		t.Fatal("authorization request omitted scopes")
	}
	result, err := s.CompleteOAuth(ctx, u.Query().Get("state"), "code")
	if !errors.Is(err, ErrSendPermission) || profiles.Load() != 0 || result.ErrorCode != "scopes_required" {
		t.Fatalf("result=%+v err=%v profiles=%d", result, err, profiles.Load())
	}
	if _, err := s.CompleteOAuth(ctx, u.Query().Get("state"), "code"); !errors.Is(err, ErrInvalidOAuthState) {
		t.Fatalf("OAuth state reused: %v", err)
	}
}

func TestOutboundIntegrationAttachmentsAndDisconnect(t *testing.T) {
	var sends atomic.Int32
	s, p, d := emailFixture(t, emailTransport(func(r *http.Request) (*http.Response, error) {
		if strings.HasSuffix(r.URL.Path, "/send") {
			sends.Add(1)
		}
		return emailHTTP(200, `{}`), nil
	}))
	ctx := context.Background()
	s.storage = emailObjects{files: map[string][]byte{"quote": []byte("quote")}}
	a, err := s.queries.CreateAttachment(ctx, db.CreateAttachmentParams{ID: util.MustParseUUID("dddddddd-dddd-4ddd-8ddd-dddddddddddd"), WorkspaceID: p.WorkspaceID, UploaderType: "member", UploaderID: p.UserID,
		ChatSessionID: p.ChatSessionID, Filename: "quote.txt", ContentType: "text/plain", SizeBytes: 5, Url: "https://objects.test/quote"})
	if err != nil {
		t.Fatal(err)
	}
	d.AttachmentIDs = []string{util.UUIDToString(a.ID)}
	email, id := createEmail(t, s, p, d)
	if len(email.Attachments) != 1 || email.Attachments[0].Filename != "quote.txt" {
		t.Fatal("attachment projection lost")
	}
	foreignSession := util.MustParseUUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
	_, err = s.pool.Exec(ctx, `UPDATE attachment SET chat_session_id=$1 WHERE id=$2`, foreignSession, a.ID)
	// Some installations retain the historical FK: use a real second session.
	if err != nil {
		var agentID pgtype.UUID
		if err := s.pool.QueryRow(ctx, `SELECT agent_id FROM chat_session WHERE id=$1`, p.ChatSessionID).Scan(&agentID); err != nil {
			t.Fatal(err)
		}
		session, err := s.queries.CreateChatSession(ctx, db.CreateChatSessionParams{WorkspaceID: p.WorkspaceID, AgentID: agentID, CreatorID: p.UserID})
		if err != nil {
			t.Fatal(err)
		}
		_, err = s.pool.Exec(ctx, `UPDATE attachment SET chat_session_id=$1 WHERE id=$2`, session.ID, a.ID)
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.QueueEmail(ctx, p, id, email.Version); !errors.Is(err, ErrEmailNotFound) {
		t.Fatalf("foreign conversation attachment sent: %v", err)
	}
	_, err = s.pool.Exec(ctx, `UPDATE attachment SET chat_session_id=$1 WHERE id=$2`, p.ChatSessionID, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.QueueEmail(ctx, p, id, email.Version); err != nil {
		t.Fatal(err)
	}
	claim, err := s.queries.ClaimOutboundEmail(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Disconnect(ctx, p.UserID, util.MustParseUUID(d.ConnectionID)); err != nil {
		t.Fatal(err)
	}
	s.deliverEmail(ctx, claim)
	if sends.Load() != 0 {
		t.Fatal("disconnected account submitted an email")
	}
	if _, err := s.GetEmail(ctx, p, id); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("disconnect retained copied email: %v", err)
	}
}

func TestOutboundIntegrationCompleteOAuthEnablesReadAndSend(t *testing.T) {
	s, p, _ := emailFixture(t, emailTransport(func(r *http.Request) (*http.Response, error) {
		if strings.Contains(r.URL.Path, "profile") {
			return emailHTTP(200, `{"emailAddress":"sender@example.test","historyId":"1"}`), nil
		}
		return emailHTTP(200, `{"access_token":"complete","refresh_token":"refresh","expires_in":3600,"scope":"`+gmailReadonlyScope+` `+gmailSendScope+`"}`), nil
	}))
	ctx := context.Background()
	redirect, err := s.BeginConnect(ctx, p.UserID, p.WorkspaceID, "/connections")
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(redirect)
	if _, err := s.CompleteOAuth(ctx, u.Query().Get("state"), "code"); err != nil {
		t.Fatal(err)
	}
	connections, err := s.ListConnections(ctx, p.UserID, p.WorkspaceID)
	if err != nil || len(connections) != 1 || !connections[0].CanSend || !connections[0].AnalysisEnabled {
		t.Fatalf("connections=%+v err=%v", connections, err)
	}
}

func TestOutboundIntegrationParentCleanup(t *testing.T) {
	for _, parent := range []string{"session", "workspace", "member", "runtime"} {
		t.Run(parent, func(t *testing.T) {
			s, p, d := emailFixture(t, emailTransport(func(*http.Request) (*http.Response, error) { t.Fatal("cleanup must not send"); return nil, nil }))
			ctx := context.Background()
			_, id := createEmail(t, s, p, d)
			tx, err := s.pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			q := s.queries.WithTx(tx)
			switch parent {
			case "session":
				err = q.DeleteChatSession(ctx, db.DeleteChatSessionParams{ID: p.ChatSessionID, WorkspaceID: p.WorkspaceID})
			case "workspace":
				err = q.DeleteWorkspace(ctx, p.WorkspaceID)
			case "member":
				err = q.DeleteGmailAnalysisBindingsByWorkspaceUser(ctx, db.DeleteGmailAnalysisBindingsByWorkspaceUserParams{WorkspaceID: p.WorkspaceID, UserID: p.UserID})
			case "runtime":
				var runtimeID pgtype.UUID
				err = tx.QueryRow(ctx, `UPDATE agent SET archived_at=now() WHERE id=(SELECT agent_id FROM chat_session WHERE id=$1) RETURNING runtime_id`, p.ChatSessionID).Scan(&runtimeID)
				if err == nil {
					err = q.DeleteChatDraftRestoresByArchivedRuntimeAgents(ctx, runtimeID)
				}
			}
			if err != nil {
				t.Fatal(err)
			}
			if err := tx.Commit(ctx); err != nil {
				t.Fatal(err)
			}
			if _, err := s.GetEmail(ctx, p, id); !errors.Is(err, pgx.ErrNoRows) {
				t.Fatalf("%s cleanup retained email: %v", parent, err)
			}
		})
	}
}
