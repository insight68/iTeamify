package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/iteamify-ai/iteamify/server/internal/auth"
	"github.com/iteamify-ai/iteamify/server/internal/middleware"
	"github.com/iteamify-ai/iteamify/server/internal/service"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5/pgtype"
)

const testPassword = "Correct horse river meadow"

func passwordTestHandler(t *testing.T) (*Handler, string) {
	t.Helper()
	if testPool == nil {
		t.Fatal("password integration tests require a migrated database")
	}
	t.Setenv("APP_ENV", "test")
	t.Setenv(devVerificationCodeEnv, "")
	t.Setenv("SMTP_HOST", "")
	t.Setenv("RESEND_API_KEY", "")
	h := *testHandler
	h.EmailService = service.NewEmailService()
	email := "password-" + uuid.NewString() + "@example.test"
	t.Cleanup(func() {
		ctx := context.Background()
		for _, statement := range []string{
			`DELETE FROM user_password WHERE user_id IN (SELECT id FROM "user" WHERE email=$1)`,
			`DELETE FROM auth_challenge WHERE email=$1`,
			`DELETE FROM password_login_attempt WHERE email=$1`,
			`DELETE FROM verification_code WHERE email=$1`,
			`DELETE FROM "user" WHERE email=$1`,
		} {
			if _, err := testPool.Exec(ctx, statement, email); err != nil {
				t.Errorf("cleanup: %v", err)
			}
		}
	})
	return &h, email
}

func passwordRequest(t *testing.T, handler http.HandlerFunc, input any, uid string) *httptest.ResponseRecorder {
	t.Helper()
	data, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(data))
	if uid != "" {
		r.Header.Set("X-User-ID", uid)
	}
	w := httptest.NewRecorder()
	handler(w, r)
	return w
}

func requirePasswordStatus(t *testing.T, w *httptest.ResponseRecorder, status int) {
	t.Helper()
	if w.Code != status {
		t.Fatalf("want status %d, got %d: %s", status, w.Code, w.Body.String())
	}
}

func passwordUser(t *testing.T, h *Handler, email string) db.User {
	t.Helper()
	u, err := h.Queries.CreateUser(context.Background(), db.CreateUserParams{Name: "Password User", Email: email})
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func passwordChallenge(t *testing.T, h *Handler, email, purpose string) string {
	t.Helper()
	id := uuid.NewString()
	ctx := context.Background()
	_, err := h.Queries.CreateAuthChallenge(ctx, db.CreateAuthChallengeParams{
		ID: parseUUID(id), Email: email, Purpose: purpose,
		CodeHash:  challengeHash(id, purpose, "654321"),
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Minute), Valid: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := h.Queries.MarkAuthChallengeSent(ctx, parseUUID(id)); err != nil {
		t.Fatal(err)
	}
	return id
}

func passwordProof(t *testing.T, h *Handler, email, purpose string) authProofRequest {
	t.Helper()
	id := passwordChallenge(t, h, email, purpose)
	req := authProofRequest{Email: email, Purpose: purpose, ChallengeID: id, Code: "654321"}
	w := passwordRequest(t, h.VerifyAuthChallenge, req, "")
	requirePasswordStatus(t, w, 200)
	var response struct{ Action, Proof string }
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Proof == "" || response.Action != purpose {
		t.Fatalf("unexpected verification: %s", w.Body.String())
	}
	req.Code, req.Proof = "", response.Proof
	return req
}

func passwordLoginResponse(t *testing.T, w *httptest.ResponseRecorder) LoginResponse {
	t.Helper()
	requirePasswordStatus(t, w, 200)
	var result LoginResponse
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Token == "" || result.User.ID == "" {
		t.Fatal("missing identity")
	}
	return result
}

func passwordClaims(t *testing.T, token string) jwt.MapClaims {
	t.Helper()
	parsed, err := jwt.Parse(token, func(*jwt.Token) (any, error) { return auth.JWTSecret(), nil })
	if err != nil {
		t.Fatal(err)
	}
	return parsed.Claims.(jwt.MapClaims)
}

func TestPasswordSignupAtomicAndLogin(t *testing.T) {
	h, email := passwordTestHandler(t)
	proof := passwordProof(t, h, email, "signup")
	if _, err := h.Queries.GetUserByEmail(context.Background(), email); !isNotFound(err) {
		t.Fatal("verification must not create a user")
	}
	proof.Password = testPassword
	var wg sync.WaitGroup
	writers := make([]*httptest.ResponseRecorder, 2)
	for i := range writers {
		wg.Add(1)
		go func(index int) { defer wg.Done(); writers[index] = passwordRequest(t, h.SignupWithPassword, proof, "") }(i)
	}
	wg.Wait()
	successes := 0
	for _, w := range writers {
		if w.Code == 200 {
			successes++
		} else {
			requirePasswordStatus(t, w, 400)
		}
	}
	if successes != 1 {
		t.Fatalf("concurrent registration successes: %d", successes)
	}
	u, err := h.Queries.GetUserByEmail(context.Background(), email)
	if err != nil {
		t.Fatal(err)
	}
	pw, err := h.Queries.GetUserPassword(context.Background(), u.ID)
	if err != nil || pw.AuthVersion != 1 || !strings.HasPrefix(pw.PasswordHash, "$argon2id$") {
		t.Fatalf("credential: %v %v", pw.AuthVersion, err)
	}
	login := passwordLoginResponse(t, passwordRequest(t, h.LoginWithPassword, map[string]string{"email": strings.ToUpper(email), "password": testPassword}, ""))
	if err := auth.ValidateSession(context.Background(), h.Queries, passwordClaims(t, login.Token)); err != nil {
		t.Fatal(err)
	}
	requirePasswordStatus(t, passwordRequest(t, h.LoginWithPassword, map[string]string{"email": email, "password": "incorrect password"}, ""), 401)
}

func TestPasswordPurposeAttemptsExpiryAndPromotion(t *testing.T) {
	h, email := passwordTestHandler(t)
	id := passwordChallenge(t, h, email, "login")
	req := authProofRequest{Email: email, Purpose: "reset", ChallengeID: id, Code: "654321"}
	requirePasswordStatus(t, passwordRequest(t, h.VerifyAuthChallenge, req, ""), 400)
	req.Purpose = "login"
	w := passwordRequest(t, h.VerifyAuthChallenge, req, "")
	requirePasswordStatus(t, w, 200)
	var verified struct{ Action, Proof string }
	json.Unmarshal(w.Body.Bytes(), &verified)
	if verified.Action != "signup" || verified.Proof == "" {
		t.Fatalf("new login must request password setup: %s", w.Body.String())
	}
	requirePasswordStatus(t, passwordRequest(t, h.VerifyAuthChallenge, req, ""), 400)
	req.Purpose, req.Proof, req.Password = "reset", verified.Proof, testPassword
	requirePasswordStatus(t, passwordRequest(t, h.ResetPassword, req, ""), 400)
	req.Purpose = "signup"
	passwordLoginResponse(t, passwordRequest(t, h.SignupWithPassword, req, ""))

	id = passwordChallenge(t, h, email, "reset")
	req = authProofRequest{Email: email, Purpose: "reset", ChallengeID: id, Code: "000000"}
	for range 5 {
		requirePasswordStatus(t, passwordRequest(t, h.VerifyAuthChallenge, req, ""), 400)
	}
	req.Code = "654321"
	requirePasswordStatus(t, passwordRequest(t, h.VerifyAuthChallenge, req, ""), 400)
	id = passwordChallenge(t, h, email, "reset")
	if _, err := testPool.Exec(context.Background(), `UPDATE auth_challenge SET expires_at=now()-interval '1 second' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	req.ChallengeID = id
	requirePasswordStatus(t, passwordRequest(t, h.VerifyAuthChallenge, req, ""), 400)
	proof := passwordProof(t, h, email, "reset")
	if _, err := testPool.Exec(context.Background(), `UPDATE auth_challenge SET proof_expires_at=now()-interval '1 second' WHERE id=$1`, proof.ChallengeID); err != nil {
		t.Fatal(err)
	}
	proof.Password = testPassword
	requirePasswordStatus(t, passwordRequest(t, h.ResetPassword, proof, ""), 400)
}

func TestPasswordSetResetRevokesHTTPDaemonAndCLI(t *testing.T) {
	h, email := passwordTestHandler(t)
	u := passwordUser(t, h, email)
	uid := uuidToString(u.ID)
	legacy, err := issueJWTAtVersion(u, 0)
	if err != nil {
		t.Fatal(err)
	}
	proof := passwordProof(t, h, email, "set_password")
	proof.Password = testPassword
	first := passwordLoginResponse(t, passwordRequest(t, h.ChangePassword, proof, uid))
	if err := auth.ValidateSession(context.Background(), h.Queries, passwordClaims(t, legacy)); err != auth.ErrSessionRevoked {
		t.Fatalf("legacy session: %v", err)
	}
	requirePasswordStatus(t, passwordRequest(t, h.ChangePassword, map[string]string{"password": "Another lovely password phrase", "current_password": "incorrect"}, uid), 400)
	reset := passwordProof(t, h, email, "reset")
	reset.Password = "Another lovely password phrase"
	requirePasswordStatus(t, passwordRequest(t, h.ResetPassword, reset, ""), 200)
	requirePasswordStatus(t, passwordRequest(t, h.ResetPassword, reset, ""), 400)

	for name, guard := range map[string]func(http.Handler) http.Handler{
		"http":   middleware.Auth(h.Queries, nil, nil),
		"daemon": middleware.DaemonAuth(h.Queries, nil, nil, nil),
	} {
		t.Run(name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/protected", nil)
			r.Header.Set("Authorization", "Bearer "+first.Token)
			w := httptest.NewRecorder()
			guard(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })).ServeHTTP(w, r)
			requirePasswordStatus(t, w, 401)
		})
	}
	staleClaims := passwordClaims(t, first.Token)
	r := httptest.NewRequest(http.MethodPost, "/auth/cli-token", nil)
	r.Header.Set("X-User-ID", uid)
	r = r.WithContext(auth.WithSessionClaims(r.Context(), staleClaims))
	w := httptest.NewRecorder()
	h.IssueCliToken(w, r)
	requirePasswordStatus(t, w, 401)
	data, _ := json.Marshal(map[string]string{"password": "Yet another password phrase", "current_password": reset.Password})
	r = httptest.NewRequest(http.MethodPut, "/api/me/password", bytes.NewReader(data))
	r.Header.Set("X-User-ID", uid)
	r = r.WithContext(auth.WithSessionClaims(r.Context(), staleClaims))
	w = httptest.NewRecorder()
	h.ChangePassword(w, r)
	requirePasswordStatus(t, w, 401)
	requirePasswordStatus(t, passwordRequest(t, h.LoginWithPassword, map[string]string{"email": email, "password": testPassword}, ""), 401)
	passwordLoginResponse(t, passwordRequest(t, h.LoginWithPassword, map[string]string{"email": email, "password": reset.Password}, ""))
}

func TestPasswordChallengeDeliveryCooldownAndSignupPolicy(t *testing.T) {
	h, email := passwordTestHandler(t)
	req := authChallengeRequest{Email: email, Purpose: "signup"}
	h.EmailService = nil
	requirePasswordStatus(t, passwordRequest(t, h.CreateAuthChallenge, req, ""), 503)
	h.EmailService = service.NewEmailService()
	w := passwordRequest(t, h.CreateAuthChallenge, req, "")
	requirePasswordStatus(t, w, 200)
	var response authChallengeResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	stored, err := h.Queries.GetLatestAuthChallenge(context.Background(), db.GetLatestAuthChallengeParams{Email: email, Purpose: "signup"})
	if err != nil || !stored.SentAt.Valid || len(stored.CodeHash) != 64 {
		t.Fatalf("challenge storage: %v", err)
	}
	requirePasswordStatus(t, passwordRequest(t, h.CreateAuthChallenge, req, ""), 429)
	blocked, other := passwordTestHandler(t)
	blocked.cfg.AllowSignup = false
	requirePasswordStatus(t, passwordRequest(t, blocked.CreateAuthChallenge, authChallengeRequest{Email: other, Purpose: "signup"}, ""), 403)
	requirePasswordStatus(t, passwordRequest(t, blocked.CreateAuthChallenge, authChallengeRequest{Email: other, Purpose: "reset"}, ""), 200)
}

func TestPasswordPersistentRateLimit(t *testing.T) {
	h, email := passwordTestHandler(t)
	if _, err := testPool.Exec(context.Background(), `INSERT INTO password_login_attempt(email,attempts) VALUES($1,20)`, email); err != nil {
		t.Fatal(err)
	}
	requirePasswordStatus(t, passwordRequest(t, h.LoginWithPassword, map[string]string{"email": email, "password": testPassword}, ""), 429)
	if _, err := testPool.Exec(context.Background(), `UPDATE password_login_attempt SET window_started_at=now()-interval '16 minutes' WHERE email=$1`, email); err != nil {
		t.Fatal(err)
	}
	requirePasswordStatus(t, passwordRequest(t, h.LoginWithPassword, map[string]string{"email": email, "password": testPassword}, ""), 401)
}

type passwordOAuthTransport func(*http.Request) (*http.Response, error)

func (f passwordOAuthTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestPasswordGoogleRequiresVerifiedEmailAndKeepsCredential(t *testing.T) {
	h, email := passwordTestHandler(t)
	t.Setenv("GOOGLE_CLIENT_ID", "test-client")
	t.Setenv("GOOGLE_CLIENT_SECRET", "test-secret")
	verified := false
	previous := http.DefaultClient
	http.DefaultClient = &http.Client{Transport: passwordOAuthTransport(func(r *http.Request) (*http.Response, error) {
		body := ""
		switch r.URL.Host {
		case "oauth2.googleapis.com":
			body = `{"access_token":"test-access-token"}`
		case "www.googleapis.com":
			body = fmt.Sprintf(`{"email":%q,"verified_email":%t}`, email, verified)
		default:
			return nil, fmt.Errorf("unexpected HTTP request to %s", r.URL.Host)
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	t.Cleanup(func() { http.DefaultClient = previous })
	req := GoogleLoginRequest{Code: "test-code", RedirectURI: "http://localhost/auth/callback"}
	requirePasswordStatus(t, passwordRequest(t, h.GoogleLogin, req, ""), 403)
	if _, err := h.Queries.GetUserByEmail(context.Background(), email); !isNotFound(err) {
		t.Fatal("unverified provider created an account")
	}
	u := passwordUser(t, h, email)
	hash, err := auth.HashPassword(context.Background(), testPassword)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.Queries.SetUserPassword(context.Background(), db.SetUserPasswordParams{UserID: u.ID, PasswordHash: hash}); err != nil {
		t.Fatal(err)
	}
	verified = true
	login := passwordLoginResponse(t, passwordRequest(t, h.GoogleLogin, req, ""))
	if login.User.ID != uuidToString(u.ID) {
		t.Fatal("Google created a duplicate identity")
	}
	if err := auth.ValidateSession(context.Background(), h.Queries, passwordClaims(t, login.Token)); err != nil {
		t.Fatal(err)
	}
	stored, err := h.Queries.GetUserPassword(context.Background(), u.ID)
	if err != nil || stored.PasswordHash != hash || stored.AuthVersion != 1 {
		t.Fatal("Google overwrote the password")
	}
}
