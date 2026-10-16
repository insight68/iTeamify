package gmail

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/mail"
	"reflect"
	"slices"
	"strings"
	"time"

	"github.com/iteamify-ai/iteamify/server/internal/storage"
	"github.com/iteamify-ai/iteamify/server/internal/util"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

var (
	ErrInvalidDraft   = errors.New("gmail: invalid email draft")
	ErrDraftConflict  = errors.New("gmail: draft changed or is no longer editable")
	ErrEmailNotFound  = errors.New("gmail: email not found")
	ErrSendPermission = errors.New("gmail: read and send permissions are required")
)

const maxOutboundAttachmentBytes int64 = 18 << 20

// OutboundScope is resolved from the authenticated user/task, never from tool input.
type OutboundScope struct {
	WorkspaceID, UserID, ChatSessionID, TaskID pgtype.UUID
}

type EmailDraft struct {
	ConnectionID  string   `json:"connection_id"`
	To            []string `json:"to_addresses"`
	Cc            []string `json:"cc_addresses"`
	Bcc           []string `json:"bcc_addresses"`
	Subject       string   `json:"subject"`
	Body          string   `json:"body"`
	AttachmentIDs []string `json:"attachment_ids"`
}

type EmailAttachment struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
}

type storedEmailAttachment struct {
	EmailAttachment
	Key string `json:"key"`
}

type OutboundEmail struct {
	ID             string            `json:"id"`
	WorkspaceID    string            `json:"workspace_id"`
	ChatSessionID  string            `json:"chat_session_id"`
	TaskID         string            `json:"task_id"`
	ConnectionID   string            `json:"connection_id"`
	FromAddress    string            `json:"from_address"`
	To             []string          `json:"to_addresses"`
	Cc             []string          `json:"cc_addresses"`
	Bcc            []string          `json:"bcc_addresses"`
	Subject        string            `json:"subject"`
	Body           string            `json:"body"`
	Attachments    []EmailAttachment `json:"attachments"`
	Version        int32             `json:"version"`
	Status         string            `json:"status"`
	ErrorCode      string            `json:"error_code"`
	GmailMessageID string            `json:"gmail_message_id"`
	CreatedAt      time.Time         `json:"created_at"`
	SentAt         *time.Time        `json:"sent_at"`
}

func emailView(row db.OutboundEmail) OutboundEmail {
	v := OutboundEmail{ID: util.UUIDToString(row.ID), WorkspaceID: util.UUIDToString(row.WorkspaceID),
		ChatSessionID: util.UUIDToString(row.ChatSessionID), TaskID: util.UUIDToString(row.TaskID),
		ConnectionID: util.UUIDToString(row.ConnectionID),
		FromAddress:  row.FromAddress, To: row.ToAddresses, Cc: row.CcAddresses, Bcc: row.BccAddresses,
		Subject: row.Subject, Body: row.Body, Version: row.Version, Status: row.Status,
		ErrorCode: row.ErrorCode, GmailMessageID: row.GmailMessageID, CreatedAt: row.CreatedAt.Time,
		Attachments: []EmailAttachment{}}
	// The public projection deliberately discards storage object keys.
	_ = json.Unmarshal(row.Attachments, &v.Attachments)
	if row.SentAt.Valid {
		v.SentAt = &row.SentAt.Time
	}
	return v
}

func hasRequiredScopes(scopes []string) bool {
	return slices.Contains(scopes, gmailReadonlyScope) && slices.Contains(scopes, gmailSendScope)
}

func (s *Service) ConfigureOutbound(objects storage.Storage) { s.storage = objects }

func emailUUID(value string, optional bool) (pgtype.UUID, error) {
	var id pgtype.UUID
	if value == "" && optional {
		return id, nil
	}
	if err := id.Scan(value); err != nil || !id.Valid {
		return id, ErrInvalidDraft
	}
	return id, nil
}

func normalizeDraft(d EmailDraft) (EmailDraft, error) {
	d.Subject = strings.TrimSpace(d.Subject)
	if d.Subject == "" || len(d.Subject) > 500 || strings.ContainsAny(d.Subject, "\r\n\x00") ||
		strings.TrimSpace(d.Body) == "" || len(d.Body) > 200_000 || strings.ContainsRune(d.Body, 0) ||
		len(d.To) == 0 || len(d.To)+len(d.Cc)+len(d.Bcc) > 50 || len(d.AttachmentIDs) > 10 {
		return d, ErrInvalidDraft
	}
	seen := map[string]bool{}
	normalize := func(values []string) ([]string, error) {
		result := make([]string, 0, len(values))
		for _, value := range values {
			if len(value) > 320 || strings.ContainsAny(value, "\r\n\x00") {
				return nil, ErrInvalidDraft
			}
			a, err := mail.ParseAddress(strings.TrimSpace(value))
			if err != nil || !strings.Contains(a.Address, "@") {
				return nil, ErrInvalidDraft
			}
			key := strings.ToLower(a.Address)
			if seen[key] {
				return nil, fmt.Errorf("%w: duplicate recipient", ErrInvalidDraft)
			}
			seen[key] = true
			result = append(result, a.String())
		}
		return result, nil
	}
	var err error
	if d.To, err = normalize(d.To); err != nil {
		return d, err
	}
	if d.Cc, err = normalize(d.Cc); err != nil {
		return d, err
	}
	if d.Bcc, err = normalize(d.Bcc); err != nil {
		return d, err
	}
	return d, nil
}

// Lock order matches workspace/member/session deletion. These explicit parent
// locks replace FKs and also close the disconnect-versus-send race.
func lockEmailScope(ctx context.Context, q *db.Queries, p OutboundScope) error {
	if !p.UserID.Valid || !p.WorkspaceID.Valid || !p.ChatSessionID.Valid {
		return ErrEmailNotFound
	}
	if _, err := q.LockGmailBindingScope(ctx, db.LockGmailBindingScopeParams{WorkspaceID: p.WorkspaceID, UserID: p.UserID}); err != nil {
		return err
	}
	_, err := q.LockOutboundEmailSession(ctx, db.LockOutboundEmailSessionParams{WorkspaceID: p.WorkspaceID, UserID: p.UserID, ChatSessionID: p.ChatSessionID})
	return err
}

func (s *Service) validateEmailDraft(ctx context.Context, q *db.Queries, p OutboundScope, input EmailDraft) (db.CreateOutboundEmailParams, error) {
	var params db.CreateOutboundEmailParams
	d, err := normalizeDraft(input)
	if err != nil {
		return params, err
	}
	connectionID, err := emailUUID(d.ConnectionID, false)
	if err != nil {
		return params, err
	}
	connection, err := q.LockOwnedGmailConnection(ctx, db.LockOwnedGmailConnectionParams{ID: connectionID, UserID: p.UserID})
	if err != nil {
		return params, err
	}
	if connection.Status != "active" || !hasRequiredScopes(connection.GrantedScopes) {
		return params, ErrSendPermission
	}

	attachments := make([]storedEmailAttachment, 0, len(d.AttachmentIDs))
	seen := map[string]bool{}
	var total int64
	for _, raw := range d.AttachmentIDs {
		id, err := emailUUID(raw, false)
		if err != nil || seen[raw] || s.storage == nil {
			return params, ErrInvalidDraft
		}
		seen[raw] = true
		a, err := q.GetAttachment(ctx, db.GetAttachmentParams{ID: id, WorkspaceID: p.WorkspaceID})
		if err != nil {
			return params, err
		}
		// Only this conversation's files or the originator's unbound uploads.
		inSession := a.ChatSessionID.Valid && a.ChatSessionID == p.ChatSessionID
		ownUpload := !a.ChatSessionID.Valid && !a.IssueID.Valid && !a.CommentID.Valid &&
			!a.TaskID.Valid && a.UploaderType == "member" && a.UploaderID == p.UserID
		if !inSession && !ownUpload {
			return params, ErrEmailNotFound
		}
		key := s.storage.KeyFromURL(a.Url)
		total += a.SizeBytes
		if key == "" || a.SizeBytes < 0 || total > maxOutboundAttachmentBytes ||
			strings.ContainsAny(a.Filename+a.ContentType, "\r\n\x00") {
			return params, ErrInvalidDraft
		}
		attachments = append(attachments, storedEmailAttachment{EmailAttachment: EmailAttachment{
			ID: raw, Filename: a.Filename, ContentType: a.ContentType, SizeBytes: a.SizeBytes}, Key: key})
	}
	encoded, err := json.Marshal(attachments)
	if err != nil {
		return params, err
	}
	return db.CreateOutboundEmailParams{WorkspaceID: p.WorkspaceID, UserID: p.UserID,
		ChatSessionID: p.ChatSessionID, TaskID: p.TaskID, ConnectionID: connectionID,
		FromAddress: connection.EmailAddress, ToAddresses: d.To, CcAddresses: d.Cc, BccAddresses: d.Bcc,
		Subject: d.Subject, Body: d.Body, Attachments: encoded}, nil
}

// Preview and Save share validation. An update always replaces a complete draft;
// immutable owner/session/task identity cannot be supplied in the draft payload.
func (s *Service) SaveEmailDraft(ctx context.Context, p OutboundScope, id pgtype.UUID, version int32, d EmailDraft, preview bool) (OutboundEmail, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return OutboundEmail{}, err
	}
	defer tx.Rollback(ctx)
	q := s.queries.WithTx(tx)
	if err := lockEmailScope(ctx, q, p); err != nil {
		return OutboundEmail{}, err
	}
	params, err := s.validateEmailDraft(ctx, q, p, d)
	if err != nil {
		return OutboundEmail{}, err
	}
	if id.Valid {
		row, err := q.GetOwnedOutboundEmail(ctx, db.GetOwnedOutboundEmailParams{ID: id, WorkspaceID: p.WorkspaceID, UserID: p.UserID})
		if err != nil {
			return OutboundEmail{}, err
		}
		if row.ChatSessionID != p.ChatSessionID {
			return OutboundEmail{}, ErrEmailNotFound
		}
		if row.Version != version || row.Status != "draft" {
			return OutboundEmail{}, ErrDraftConflict
		}
	}
	if preview {
		return emailView(db.OutboundEmail{ID: id, ConnectionID: params.ConnectionID, FromAddress: params.FromAddress,
			ToAddresses: params.ToAddresses, CcAddresses: params.CcAddresses,
			BccAddresses: params.BccAddresses, Subject: params.Subject, Body: params.Body, Attachments: params.Attachments}), nil
	}
	var row db.OutboundEmail
	if id.Valid {
		row, err = q.UpdateOutboundEmailDraft(ctx, db.UpdateOutboundEmailDraftParams{
			ID: id, WorkspaceID: p.WorkspaceID, UserID: p.UserID, ExpectedVersion: version,
			ConnectionID: params.ConnectionID, FromAddress: params.FromAddress, ToAddresses: params.ToAddresses, CcAddresses: params.CcAddresses, BccAddresses: params.BccAddresses,
			Subject: params.Subject, Body: params.Body, Attachments: params.Attachments})
		if errors.Is(err, pgx.ErrNoRows) {
			err = ErrDraftConflict
		}
	} else {
		row, err = q.CreateOutboundEmail(ctx, params)
	}
	if err != nil {
		return OutboundEmail{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return OutboundEmail{}, err
	}
	return emailView(row), nil
}

func (s *Service) GetEmail(ctx context.Context, p OutboundScope, id pgtype.UUID) (OutboundEmail, error) {
	row, err := s.queries.GetOwnedOutboundEmail(ctx, db.GetOwnedOutboundEmailParams{ID: id, WorkspaceID: p.WorkspaceID, UserID: p.UserID})
	if err == nil && p.ChatSessionID.Valid && p.ChatSessionID != row.ChatSessionID {
		err = ErrEmailNotFound
	}
	return emailView(row), err
}

func (s *Service) ListEmails(ctx context.Context, p OutboundScope) ([]OutboundEmail, error) {
	rows, err := s.queries.ListOwnedOutboundEmails(ctx, db.ListOwnedOutboundEmailsParams{
		WorkspaceID: p.WorkspaceID, UserID: p.UserID, ChatSessionID: p.ChatSessionID})
	if err != nil {
		return nil, err
	}
	result := make([]OutboundEmail, 0, len(rows))
	for _, row := range rows {
		result = append(result, emailView(row))
	}
	return result, nil
}

// QueueEmail is only reachable through a human-authenticated endpoint. A
// repeated click/retry for the same version returns the existing outcome.
func (s *Service) QueueEmail(ctx context.Context, p OutboundScope, id pgtype.UUID, version int32) (OutboundEmail, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return OutboundEmail{}, err
	}
	defer tx.Rollback(ctx)
	q := s.queries.WithTx(tx)
	row, err := q.GetOwnedOutboundEmail(ctx, db.GetOwnedOutboundEmailParams{ID: id, WorkspaceID: p.WorkspaceID, UserID: p.UserID})
	if err != nil {
		return OutboundEmail{}, err
	}
	if p.ChatSessionID.Valid && p.ChatSessionID != row.ChatSessionID {
		return OutboundEmail{}, ErrEmailNotFound
	}
	p.ChatSessionID = row.ChatSessionID
	if err := lockEmailScope(ctx, q, p); err != nil {
		return OutboundEmail{}, err
	}
	if row.Version != version {
		return OutboundEmail{}, ErrDraftConflict
	}
	if row.Status != "draft" {
		return emailView(row), nil
	}
	// Recheck authority and attachments immediately before freezing the draft.
	d := EmailDraft{ConnectionID: util.UUIDToString(row.ConnectionID), To: row.ToAddresses, Cc: row.CcAddresses, Bcc: row.BccAddresses, Subject: row.Subject, Body: row.Body}
	var attachments []storedEmailAttachment
	if err := json.Unmarshal(row.Attachments, &attachments); err != nil {
		return OutboundEmail{}, err
	}
	for _, a := range attachments {
		d.AttachmentIDs = append(d.AttachmentIDs, a.ID)
	}
	params, err := s.validateEmailDraft(ctx, q, p, d)
	if err != nil {
		return OutboundEmail{}, err
	}
	var validatedAttachments []storedEmailAttachment
	if err := json.Unmarshal(params.Attachments, &validatedAttachments); err != nil {
		return OutboundEmail{}, err
	}
	if !reflect.DeepEqual(validatedAttachments, attachments) || params.FromAddress != row.FromAddress {
		return OutboundEmail{}, ErrDraftConflict
	}
	queued, err := q.QueueOutboundEmail(ctx, db.QueueOutboundEmailParams{ID: id, WorkspaceID: p.WorkspaceID, UserID: p.UserID, ExpectedVersion: version})
	if errors.Is(err, pgx.ErrNoRows) {
		queued, err = q.GetOwnedOutboundEmail(ctx, db.GetOwnedOutboundEmailParams{ID: id, WorkspaceID: p.WorkspaceID, UserID: p.UserID})
		if err == nil && (queued.Version != version || queued.Status == "draft") {
			err = ErrDraftConflict
		}
	}
	if err != nil {
		return OutboundEmail{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return OutboundEmail{}, err
	}
	return emailView(queued), nil
}
