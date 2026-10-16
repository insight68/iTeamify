package gmail

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"time"

	"github.com/iteamify-ai/iteamify/server/internal/util"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5"
)

type sendResult struct {
	ID       string `json:"id"`
	ThreadID string `json:"threadId"`
}

func gmailErrorReason(body string) string {
	var response struct {
		Error struct {
			Errors []struct {
				Reason string `json:"reason"`
			} `json:"errors"`
		} `json:"error"`
	}
	if json.Unmarshal([]byte(body), &response) != nil {
		return ""
	}
	if len(response.Error.Errors) == 0 {
		return ""
	}
	return response.Error.Errors[0].Reason
}

// The caller distinguishes token/attachment failures (no submission) from this
// boundary. Any lost/malformed success response or server error is uncertain.
func (c *apiClient) sendMessage(ctx context.Context, token string, raw []byte) (sendResult, error) {
	var result sendResult
	err := c.gmailJSON(ctx, http.MethodPost, "/users/me/messages/send", token,
		map[string]string{"raw": base64.RawURLEncoding.EncodeToString(raw)}, &result)
	if err == nil && result.ID == "" {
		err = errors.New("gmail: send response missing message id")
	}
	return result, err
}

func sendOutcome(err error, submitted bool, attempts int32) (status, code string) {
	if err == nil {
		return "sent", ""
	}
	code = apiErrorCode(err, "gmail_send_failed")
	var upstream *apiError
	if errors.As(err, &upstream) {
		if code == "gmail_rate_limited" && attempts < 3 {
			return "queued", code
		}
		if submitted && upstream.Status >= 500 {
			return "unknown", "gmail_send_unknown"
		}
		return "failed", code
	}
	if submitted {
		return "unknown", "gmail_send_unknown"
	}
	if errors.Is(err, ErrSendPermission) {
		code = "gmail_permission_denied"
	}
	if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, ErrEmailNotFound) {
		code = "gmail_source_unavailable"
	}
	return "failed", code
}

func (s *Service) runOutbound(ctx context.Context) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for ctx.Err() == nil {
		if err := s.queries.ExpireOutboundEmailClaims(ctx); err != nil && ctx.Err() == nil {
			slog.Warn("gmail: expire outbound claims", "error", err)
		}
		// Drain a bounded batch. SKIP LOCKED permits multiple server replicas;
		// one worker per process keeps memory and Gmail request concurrency low.
		for i := 0; i < 20 && ctx.Err() == nil; i++ {
			row, err := s.queries.ClaimOutboundEmail(ctx)
			if errors.Is(err, pgx.ErrNoRows) {
				break
			}
			if err != nil {
				slog.Warn("gmail: claim outbound email", "error", err)
				break
			}
			s.deliverEmail(ctx, row)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *Service) deliverEmail(parent context.Context, row db.OutboundEmail) {
	// Less than the persisted lease, including attachment reads and refresh.
	ctx, cancel := context.WithTimeout(parent, 90*time.Second)
	defer cancel()
	submitted := false
	var result sendResult
	// The claim was committed before starting this transaction. A crash at any
	// point leaves `sending`, which the expiry sweep changes only to `unknown`.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(context.Background())
	q := s.queries.WithTx(tx)
	err = lockEmailScope(ctx, q, OutboundScope{WorkspaceID: row.WorkspaceID, UserID: row.UserID, ChatSessionID: row.ChatSessionID})
	if err == nil {
		var connection db.UserGmailConnection
		connection, err = q.LockOwnedGmailConnection(ctx, db.LockOwnedGmailConnectionParams{ID: row.ConnectionID, UserID: row.UserID})
		if err == nil && (connection.Status != "active" || !hasRequiredScopes(connection.GrantedScopes)) {
			err = ErrSendPermission
		}
		if err == nil {
			var raw []byte
			raw, err = s.buildOutboundMIME(ctx, row)
			if err == nil {
				var token string
				token, err = s.api.accessToken(ctx, connection)
				if err == nil && ctx.Err() == nil {
					submitted = true
					result, err = s.api.sendMessage(ctx, token, raw)
				} else if err == nil {
					err = ctx.Err()
				}
			}
		}
	}
	status, code := sendOutcome(err, submitted, row.Attempts)
	delay := time.Duration(1<<row.Attempts)*15*time.Second + time.Duration(rand.IntN(5))*time.Second
	var upstream *apiError
	if errors.As(err, &upstream) {
		delay = max(delay, upstream.RetryAfter)
	}
	// The short independent completion context records an ambiguous canceled
	// HTTP call during graceful shutdown, without reusing the canceled request.
	finishCtx, finishCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer finishCancel()
	_, finishErr := q.FinishOutboundEmail(finishCtx, db.FinishOutboundEmailParams{ID: row.ID, ClaimToken: row.ClaimToken,
		Status: status, ErrorCode: code, GmailMessageID: result.ID, GmailThreadID: result.ThreadID,
		RetryAfter: interval(delay)})
	if finishErr == nil {
		finishErr = tx.Commit(finishCtx)
	}
	if finishErr != nil {
		// Do not retry the external call if the database outcome was lost.
		slog.Warn("gmail: persist outbound outcome", "email_id", util.UUIDToString(row.ID), "status", status, "error", finishErr)
	} else if permanentConnectionError(code) {
		s.api.forget(row.ConnectionID)
		s.markConnectionError(finishCtx, row.ConnectionID, code)
	}
}

func (s *Service) readEmailAttachment(ctx context.Context, a storedEmailAttachment) ([]byte, error) {
	if s.storage == nil || a.SizeBytes < 0 || a.SizeBytes > maxOutboundAttachmentBytes {
		return nil, ErrInvalidDraft
	}
	r, err := s.storage.GetReader(ctx, a.Key)
	if err != nil {
		return nil, fmt.Errorf("gmail: attachment unavailable: %w", err)
	}
	defer r.Close()
	data, err := io.ReadAll(io.LimitReader(r, a.SizeBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) != a.SizeBytes {
		return nil, errors.New("gmail: attachment size changed")
	}
	return data, nil
}
