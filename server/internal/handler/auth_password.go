package handler

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/iteamify-ai/iteamify/server/internal/auth"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type authChallengeRequest struct {
	Email    string `json:"email"`
	Purpose  string `json:"purpose"`
	Language string `json:"language"`
}

type authChallengeResponse struct {
	ChallengeID       string `json:"challenge_id"`
	RetryAfterSeconds int    `json:"retry_after_seconds"`
	ExpiresInSeconds  int    `json:"expires_in_seconds"`
}

type authProofRequest struct {
	Email           string `json:"email"`
	Purpose         string `json:"purpose"`
	ChallengeID     string `json:"challenge_id"`
	Code            string `json:"code"`
	Proof           string `json:"proof"`
	Password        string `json:"password"`
	CurrentPassword string `json:"current_password"`
	Language        string `json:"language"`
}

func writeAuthError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"error": message, "code": code})
}

func decodeAuthBody(w http.ResponseWriter, r *http.Request, value any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	if err := json.NewDecoder(r.Body).Decode(value); err != nil {
		writeAuthError(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return false
	}
	return true
}

func normalizedAuthEmail(raw string) (string, bool) {
	email := strings.ToLower(strings.TrimSpace(raw))
	parsed, err := mail.ParseAddress(email)
	return email, err == nil && len(email) <= 254 && parsed.Address == email
}

func challengeHash(id, purpose, value string) string {
	mac := hmac.New(sha256.New, auth.JWTSecret())
	mac.Write([]byte("auth-challenge-v1:" + id + ":" + purpose + ":" + value))
	return hex.EncodeToString(mac.Sum(nil))
}

func randomAuthProof() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func (h *Handler) beginAuth(w http.ResponseWriter, r *http.Request, email string) (pgx.Tx, *db.Queries, bool) {
	if h.TxStarter == nil {
		writeAuthError(w, http.StatusServiceUnavailable, "unavailable", "authentication unavailable")
		return nil, nil, false
	}
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeAuthError(w, http.StatusServiceUnavailable, "unavailable", "authentication unavailable")
		return nil, nil, false
	}
	q := db.New(tx)
	if err := q.LockAuthEmail(r.Context(), email); err != nil {
		tx.Rollback(r.Context())
		writeAuthError(w, http.StatusServiceUnavailable, "unavailable", "authentication unavailable")
		return nil, nil, false
	}
	return tx, q, true
}

func commitAuth(w http.ResponseWriter, r *http.Request, tx pgx.Tx) bool {
	if err := tx.Commit(r.Context()); err != nil {
		writeAuthError(w, http.StatusServiceUnavailable, "unavailable", "authentication unavailable")
		return false
	}
	return true
}

func (h *Handler) CreateAuthChallenge(w http.ResponseWriter, r *http.Request) {
	h.sendAuthChallenge(w, r, false)
}

func (h *Handler) SendPasswordChallenge(w http.ResponseWriter, r *http.Request) {
	h.sendAuthChallenge(w, r, true)
}

func (h *Handler) sendAuthChallenge(w http.ResponseWriter, r *http.Request, settingPassword bool) {
	var req authChallengeRequest
	if !decodeAuthBody(w, r, &req) {
		return
	}
	email, valid := normalizedAuthEmail(req.Email)
	if settingPassword {
		uid, ok := requireUserID(w, r)
		if !ok {
			return
		}
		user, err := h.Queries.GetUser(r.Context(), parseUUID(uid))
		if err != nil {
			if isNotFound(err) {
				writeAuthError(w, 401, "session_expired", "session expired")
			} else {
				writeAuthError(w, 503, "unavailable", "authentication unavailable")
			}
			return
		}
		email, valid = user.Email, true
		req.Purpose = "set_password"
	}
	if !valid || (!settingPassword && req.Purpose != "login" && req.Purpose != "signup" && req.Purpose != "reset") {
		writeAuthError(w, 400, "invalid_request", "valid email and purpose are required")
		return
	}
	tx, q, ok := h.beginAuth(w, r, email)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	user, err := q.GetUserByEmail(r.Context(), email)
	if err != nil && !isNotFound(err) {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	if isNotFound(err) && req.Purpose != "reset" {
		if err := h.checkSignupAllowed(email, true); err != nil {
			writeAuthError(w, 403, "signup_disabled", err.Error())
			return
		}
	}
	if settingPassword {
		_, err := q.GetUserPassword(r.Context(), user.ID)
		if err == nil {
			writeAuthError(w, 409, "password_exists", "use your current password to change it")
			return
		}
		if !isNotFound(err) {
			writeAuthError(w, 503, "unavailable", "authentication unavailable")
			return
		}
	}
	latest, err := q.GetLatestAuthChallenge(r.Context(), db.GetLatestAuthChallengeParams{Email: email, Purpose: req.Purpose})
	if err != nil && !isNotFound(err) {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	if err == nil && time.Since(latest.CreatedAt.Time) < time.Minute {
		seconds := max(1, int(time.Until(latest.CreatedAt.Time.Add(time.Minute)).Seconds())+1)
		w.Header().Set("Retry-After", strconv.Itoa(seconds))
		writeJSON(w, 429, map[string]any{"error": "please wait before requesting another code", "code": "rate_limited", "retry_after_seconds": seconds})
		return
	}
	id := uuid.NewString()
	code, err := generateCode()
	if err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	if err := q.InvalidateAuthChallenges(r.Context(), db.InvalidateAuthChallengesParams{Email: email, Purpose: req.Purpose}); err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	_, err = q.CreateAuthChallenge(r.Context(), db.CreateAuthChallengeParams{
		ID: parseUUID(id), Email: email, Purpose: req.Purpose,
		CodeHash:  challengeHash(id, req.Purpose, code),
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(10 * time.Minute), Valid: true},
	})
	if err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	if !commitAuth(w, r, tx) {
		return
	}
	if h.EmailService == nil || h.EmailService.SendAuthCode(email, code, req.Purpose, req.Language) != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := h.Queries.MarkAuthChallengeDeliveryFailed(ctx, parseUUID(id)); err != nil {
			slog.Error("failed to invalidate undelivered auth challenge", "error", err)
		}
		writeAuthError(w, 503, "send_failed", "verification email could not be sent; please retry")
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.Queries.MarkAuthChallengeSent(ctx, parseUUID(id)); err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	_ = h.Queries.DeleteExpiredAuthChallenges(r.Context())
	writeJSON(w, 200, authChallengeResponse{ChallengeID: id, RetryAfterSeconds: 60, ExpiresInSeconds: 600})
}

func (h *Handler) VerifyAuthChallenge(w http.ResponseWriter, r *http.Request) {
	var req authProofRequest
	if !decodeAuthBody(w, r, &req) {
		return
	}
	email, valid := normalizedAuthEmail(req.Email)
	id, ok := parseUUIDOrBadRequest(w, req.ChallengeID, "challenge_id")
	if !ok {
		return
	}
	if !valid || !isSixDigitCode(req.Code) {
		writeAuthError(w, 400, "code_invalid", "invalid or expired code")
		return
	}
	tx, q, ok := h.beginAuth(w, r, email)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	challenge, err := q.GetAuthChallengeForUpdate(r.Context(), db.GetAuthChallengeForUpdateParams{ID: id, Email: email, Purpose: req.Purpose})
	if err != nil && !isNotFound(err) {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	if err != nil || challenge.UsedAt.Valid || challenge.VerifiedAt.Valid || !challenge.SentAt.Valid || challenge.Attempts >= 5 || !challenge.ExpiresAt.Time.After(time.Now()) {
		writeAuthError(w, 400, "code_invalid", "invalid or expired code")
		return
	}
	if !isDevVerificationCode(req.Code) && subtle.ConstantTimeCompare([]byte(challenge.CodeHash), []byte(challengeHash(req.ChallengeID, req.Purpose, req.Code))) != 1 {
		if err := q.IncrementAuthChallengeAttempts(r.Context(), id); err != nil {
			writeAuthError(w, 503, "unavailable", "authentication unavailable")
			return
		}
		if !commitAuth(w, r, tx) {
			return
		}
		writeAuthError(w, 400, "code_invalid", "invalid or expired code")
		return
	}
	if req.Purpose == "login" || req.Purpose == "signup" {
		user, err := q.GetUserByEmail(r.Context(), email)
		if err == nil {
			version, err := q.GetUserAuthVersion(r.Context(), user.ID)
			if err != nil {
				writeAuthError(w, 503, "unavailable", "authentication unavailable")
				return
			}
			token, err := issueJWTAtVersion(user, version)
			if err != nil {
				writeAuthError(w, 503, "unavailable", "authentication unavailable")
				return
			}
			if err := q.ConsumeAuthChallenge(r.Context(), id); err != nil {
				writeAuthError(w, 503, "unavailable", "authentication unavailable")
				return
			}
			if !commitAuth(w, r, tx) {
				return
			}
			h.setLoginCookies(w, token)

			writeJSON(w, 200, map[string]any{"action": "authenticated", "token": token, "user": userToResponse(user)})
			return
		}
		if !isNotFound(err) {
			writeAuthError(w, 503, "unavailable", "authentication unavailable")
			return
		}
		if err := h.checkSignupAllowed(email, true); err != nil {
			writeAuthError(w, 403, "signup_disabled", err.Error())
			return
		}
		if req.Purpose == "login" {
			if err := q.InvalidateAuthChallenges(r.Context(), db.InvalidateAuthChallengesParams{Email: email, Purpose: "signup"}); err != nil {
				writeAuthError(w, 503, "unavailable", "authentication unavailable")
				return
			}
			if err := q.PromoteAuthChallengeToSignup(r.Context(), id); err != nil {
				writeAuthError(w, 503, "unavailable", "authentication unavailable")
				return
			}
			req.Purpose = "signup"
		}
	}
	proof, err := randomAuthProof()
	if err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	if err := q.VerifyAuthChallenge(r.Context(), db.VerifyAuthChallengeParams{ID: id, ProofHash: pgtype.Text{String: challengeHash(req.ChallengeID, req.Purpose, proof), Valid: true}}); err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	if !commitAuth(w, r, tx) {
		return
	}
	writeJSON(w, 200, map[string]string{"action": req.Purpose, "proof": proof})
}

func loadAuthProof(w http.ResponseWriter, r *http.Request, q *db.Queries, req authProofRequest) (db.AuthChallenge, bool) {
	id, ok := parseUUIDOrBadRequest(w, req.ChallengeID, "challenge_id")
	if !ok {
		return db.AuthChallenge{}, false
	}
	c, err := q.GetAuthChallengeForUpdate(r.Context(), db.GetAuthChallengeForUpdateParams{ID: id, Email: req.Email, Purpose: req.Purpose})
	if err != nil && !isNotFound(err) {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return db.AuthChallenge{}, false
	}
	if err != nil || c.UsedAt.Valid || !c.VerifiedAt.Valid || !c.ProofHash.Valid || !c.ProofExpiresAt.Valid || !c.ProofExpiresAt.Time.After(time.Now()) || len(req.Proof) != 64 ||
		subtle.ConstantTimeCompare([]byte(c.ProofHash.String), []byte(challengeHash(req.ChallengeID, req.Purpose, req.Proof))) != 1 {
		writeAuthError(w, 400, "proof_expired", "verification expired; request a new code")
		return db.AuthChallenge{}, false
	}
	return c, true
}

func (h *Handler) SignupWithPassword(w http.ResponseWriter, r *http.Request) {
	var req authProofRequest
	if !decodeAuthBody(w, r, &req) {
		return
	}
	var valid bool
	req.Email, valid = normalizedAuthEmail(req.Email)
	if !valid || req.Purpose != "signup" {
		writeAuthError(w, 400, "invalid_request", "invalid registration request")
		return
	}
	if err := h.checkSignupAllowed(req.Email, true); err != nil {
		writeAuthError(w, 403, "signup_disabled", err.Error())
		return
	}
	hash, err := auth.HashPassword(r.Context(), req.Password)
	if err != nil {
		writeAuthError(w, 400, "password_policy", auth.ErrPasswordPolicy.Error())
		return
	}
	tx, q, ok := h.beginAuth(w, r, req.Email)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	c, ok := loadAuthProof(w, r, q, req)
	if !ok {
		return
	}
	_, err = q.GetUserByEmail(r.Context(), req.Email)
	if err == nil {
		writeAuthError(w, 409, "account_exists", "this account already exists; sign in instead")
		return
	}
	if !isNotFound(err) {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	name := strings.Split(req.Email, "@")[0]
	user, err := q.CreateUser(r.Context(), db.CreateUserParams{Name: name, Email: req.Email})
	if err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	credential, err := q.SetUserPassword(r.Context(), db.SetUserPasswordParams{UserID: user.ID, PasswordHash: hash})
	if err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	if err := q.ConsumeAuthChallenge(r.Context(), c.ID); err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	token, err := issueJWTAtVersion(user, credential.AuthVersion)
	if err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	if !commitAuth(w, r, tx) {
		return
	}
	h.recordSignupFromRequest(r, user, "password")
	h.writePasswordLogin(w, user, token)
}

func (h *Handler) LoginWithPassword(w http.ResponseWriter, r *http.Request) {
	var req authProofRequest
	if !decodeAuthBody(w, r, &req) {
		return
	}
	email, valid := normalizedAuthEmail(req.Email)
	if !valid {
		writeAuthError(w, 401, "credentials_invalid", "email or password is incorrect")
		return
	}
	tx, q, ok := h.beginAuth(w, r, email)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	attempts, err := q.RecordPasswordLoginAttempt(r.Context(), email)
	if err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	if attempts > 20 {
		if !commitAuth(w, r, tx) {
			return
		}
		w.Header().Set("Retry-After", "900")
		writeAuthError(w, 429, "rate_limited", "too many attempts; try again later or use a verification code")
		return
	}
	user, userErr := q.GetUserByEmail(r.Context(), email)
	if userErr != nil && !isNotFound(userErr) {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	encoded := auth.DummyPasswordHash()
	var credential db.UserPassword
	credentialErr := pgx.ErrNoRows
	if userErr == nil {
		credential, credentialErr = q.GetUserPassword(r.Context(), user.ID)
		if credentialErr != nil && !isNotFound(credentialErr) {
			writeAuthError(w, 503, "unavailable", "authentication unavailable")
			return
		}
		if credentialErr == nil {
			encoded = credential.PasswordHash
		}
	}
	correct := auth.CheckPassword(r.Context(), encoded, req.Password)
	if !correct || userErr != nil || credentialErr != nil {
		if !commitAuth(w, r, tx) {
			return
		}
		writeAuthError(w, 401, "credentials_invalid", "email or password is incorrect")
		return
	}
	if err := q.ClearPasswordLoginAttempts(r.Context(), email); err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	token, err := issueJWTAtVersion(user, credential.AuthVersion)
	if err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	if !commitAuth(w, r, tx) {
		return
	}
	_ = h.Queries.DeleteExpiredPasswordAttempts(r.Context())
	h.writePasswordLogin(w, user, token)
}

func (h *Handler) GetPasswordStatus(w http.ResponseWriter, r *http.Request) {
	uid, ok := requireUserID(w, r)
	if !ok {
		return
	}
	_, err := h.Queries.GetUserPassword(r.Context(), parseUUID(uid))
	if err != nil && !isNotFound(err) {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	writeJSON(w, 200, map[string]bool{"has_password": err == nil})
}

func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	h.savePassword(w, r, false)
}

func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	h.savePassword(w, r, true)
}

func (h *Handler) savePassword(w http.ResponseWriter, r *http.Request, authenticated bool) {
	var req authProofRequest
	if !decodeAuthBody(w, r, &req) {
		return
	}
	var valid bool
	req.Email, valid = normalizedAuthEmail(req.Email)
	if authenticated {
		uid, ok := requireUserID(w, r)
		if !ok {
			return
		}
		user, err := h.Queries.GetUser(r.Context(), parseUUID(uid))
		if err != nil {
			if isNotFound(err) {
				writeAuthError(w, 401, "session_expired", "session expired")
			} else {
				writeAuthError(w, 503, "unavailable", "authentication unavailable")
			}
			return
		}
		req.Email, valid = user.Email, true
	}
	if !valid || (!authenticated && req.Purpose != "reset") {
		writeAuthError(w, 400, "invalid_request", "invalid password request")
		return
	}
	hash, err := auth.HashPassword(r.Context(), req.Password)
	if err != nil {
		writeAuthError(w, 400, "password_policy", auth.ErrPasswordPolicy.Error())
		return
	}
	tx, q, ok := h.beginAuth(w, r, req.Email)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	user, err := q.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		if !isNotFound(err) {
			writeAuthError(w, 503, "unavailable", "authentication unavailable")
			return
		}
		writeAuthError(w, 400, "proof_expired", "invalid or expired verification")
		return
	}
	if authenticated {
		if claims := auth.SessionClaims(r.Context()); claims != nil {
			if err := auth.ValidateSession(r.Context(), q, claims); err != nil {
				if errors.Is(err, auth.ErrSessionRevoked) {
					writeAuthError(w, 401, "session_expired", "session expired")
				} else {
					writeAuthError(w, 503, "unavailable", "authentication unavailable")
				}
				return
			}
		}
		credential, err := q.GetUserPassword(r.Context(), user.ID)
		if err == nil {
			attempts, attemptErr := q.RecordPasswordLoginAttempt(r.Context(), req.Email)
			if attemptErr != nil {
				writeAuthError(w, 503, "unavailable", "authentication unavailable")
				return
			}
			if attempts > 20 {
				if !commitAuth(w, r, tx) {
					return
				}
				w.Header().Set("Retry-After", "900")
				writeAuthError(w, 429, "rate_limited", "too many attempts; try again later")
				return
			}
			if !auth.CheckPassword(r.Context(), credential.PasswordHash, req.CurrentPassword) {
				if !commitAuth(w, r, tx) {
					return
				}
				writeAuthError(w, 400, "current_password_invalid", "current password is incorrect")
				return
			}
		} else if isNotFound(err) {
			if req.Purpose != "set_password" {
				writeAuthError(w, 400, "proof_expired", "verify your email to set a password")
				return
			}
			if _, ok := loadAuthProof(w, r, q, req); !ok {
				return
			}
		} else {
			writeAuthError(w, 503, "unavailable", "authentication unavailable")
			return
		}
	} else {
		if _, ok := loadAuthProof(w, r, q, req); !ok {
			return
		}
	}
	credential, err := q.SetUserPassword(r.Context(), db.SetUserPasswordParams{UserID: user.ID, PasswordHash: hash})
	if err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	if err := q.InvalidatePasswordChallenges(r.Context(), req.Email); err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	if err := q.DeleteVerificationCodesByEmail(r.Context(), req.Email); err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	if err := q.ClearPasswordLoginAttempts(r.Context(), req.Email); err != nil {
		writeAuthError(w, 503, "unavailable", "authentication unavailable")
		return
	}
	var token string
	if authenticated {
		token, err = issueJWTAtVersion(user, credential.AuthVersion)
		if err != nil {
			writeAuthError(w, 503, "unavailable", "authentication unavailable")
			return
		}
	}
	if !commitAuth(w, r, tx) {
		return
	}
	if h.Hub != nil {
		h.Hub.RevokeUserSessions(uuidToString(user.ID), credential.AuthVersion)
	}
	// Deliver notifications without delaying the rotated session credential.
	if emailService := h.EmailService; emailService != nil {
		go func() {
			if err := emailService.SendPasswordChanged(user.Email, req.Language); err != nil {
				slog.Warn("password change notification failed", "user_id", uuidToString(user.ID), "error", err)
			}
		}()
	}
	if authenticated {
		h.writePasswordLogin(w, user, token)
		return
	}
	auth.ClearAuthCookies(w)
	writeJSON(w, 200, map[string]bool{"success": true})
}

func (h *Handler) setLoginCookies(w http.ResponseWriter, token string) {
	if err := auth.SetAuthCookies(w, token); err != nil {
		slog.Warn("failed to set auth cookies", "error", err)
	}
	if h.CFSigner != nil {
		for _, cookie := range h.CFSigner.SignedCookies(time.Now().Add(auth.AuthTokenTTL())) {
			http.SetCookie(w, cookie)
		}
	}
}

func (h *Handler) writePasswordLogin(w http.ResponseWriter, user db.User, token string) {
	h.setLoginCookies(w, token)

	writeJSON(w, 200, LoginResponse{Token: token, User: userToResponse(user)})
}
