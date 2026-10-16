package gmail

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/mail"
	"strings"
	"testing"
	"time"

	"github.com/iteamify-ai/iteamify/server/internal/storage"
	"github.com/iteamify-ai/iteamify/server/internal/util"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5/pgtype"
)

type emailTransport func(*http.Request) (*http.Response, error)

func (f emailTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func emailHTTP(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}
}

type emailObjects struct {
	storage.Storage
	files map[string][]byte
}

func (s emailObjects) GetReader(_ context.Context, key string) (io.ReadCloser, error) {
	data, ok := s.files[key]
	if !ok {
		return nil, errors.New("missing file")
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}
func (s emailObjects) KeyFromURL(value string) string {
	return strings.TrimPrefix(value, "https://objects.test/")
}

func TestOutboundMIMEAndSendBoundary(t *testing.T) {
	s := &Service{storage: emailObjects{files: map[string][]byte{"quote": []byte("报价 attachment")}}}
	attachments, _ := json.Marshal([]storedEmailAttachment{{EmailAttachment: EmailAttachment{ID: "file-1", Filename: "报价.pdf", ContentType: "application/pdf", SizeBytes: int64(len("报价 attachment"))}, Key: "quote"}})
	row := db.OutboundEmail{ID: util.MustParseUUID("11111111-1111-4111-8111-111111111111"), FromAddress: "seller@example.com", ToAddresses: []string{"buyer@example.com"}, BccAddresses: []string{"archive@example.com"}, Subject: "报价：100 件产品", Body: "您好，\n请查收报价。", Attachments: attachments, QueuedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}}
	raw, err := s.buildOutboundMIME(context.Background(), row)
	if err != nil {
		t.Fatal(err)
	}
	message, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	if message.Header.Get("Bcc") != "archive@example.com" {
		t.Fatal("Bcc envelope recipient lost")
	}
	subject, err := new(mime.WordDecoder).DecodeHeader(message.Header.Get("Subject"))
	if err != nil || subject != row.Subject {
		t.Fatalf("subject=%q err=%v", subject, err)
	}
	_, params, _ := mime.ParseMediaType(message.Header.Get("Content-Type"))
	reader := multipart.NewReader(message.Body, params["boundary"])
	bodyPart, err := reader.NextPart()
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(bodyPart)
	if strings.ReplaceAll(string(body), "\r\n", "\n") != row.Body {
		t.Fatalf("body=%q", body)
	}
	filePart, err := reader.NextPart()
	if err != nil {
		t.Fatal(err)
	}
	if filePart.FileName() != "报价.pdf" {
		t.Fatalf("filename=%q", filePart.FileName())
	}
	file, err := io.ReadAll(base64.NewDecoder(base64.StdEncoding, filePart))
	if err != nil || string(file) != "报价 attachment" {
		t.Fatalf("file=%q err=%v", file, err)
	}
	c := newAPIClient(Config{HTTPTimeout: time.Second}, nil, emailTransport(func(r *http.Request) (*http.Response, error) {
		if r.Method != "POST" || r.URL.Path != "/gmail/v1/users/me/messages/send" || r.Header.Get("Authorization") != "Bearer test-token" {
			t.Fatalf("bad send request: %s %s", r.Method, r.URL.Path)
		}
		var payload struct {
			Raw string `json:"raw"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		decoded, err := base64.RawURLEncoding.DecodeString(payload.Raw)
		if err != nil || !bytes.Equal(decoded, raw) {
			t.Fatal("MIME changed in API transport")
		}
		return emailHTTP(200, `{"id":"gmail-id","threadId":"thread-id"}`), nil
	}))
	result, err := c.sendMessage(context.Background(), "test-token", raw)
	if err != nil || result.ID != "gmail-id" {
		t.Fatalf("result=%+v err=%v", result, err)
	}
}

func TestOutboundRejectsHeaderInjectionAndDuplicateRecipients(t *testing.T) {
	for _, mutate := range []func(*EmailDraft){
		func(d *EmailDraft) { d.Subject = "Quote\r\nBcc: victim@example.com" },
		func(d *EmailDraft) { d.To = []string{"buyer@example.com\r\nBcc: victim@example.com"} },
		func(d *EmailDraft) { d.Bcc = []string{"Buyer@example.com"} },
	} {
		d := EmailDraft{To: []string{"buyer@example.com"}, Subject: "Quote", Body: "Hello"}
		mutate(&d)
		if _, err := normalizeDraft(d); !errors.Is(err, ErrInvalidDraft) {
			t.Fatalf("unsafe draft accepted: %v", err)
		}
	}
}

func TestOutboundErrorPolicy(t *testing.T) {
	for _, tt := range []struct {
		name         string
		err          error
		submitted    bool
		attempts     int32
		status, code string
	}{
		{"timeout after submit", context.DeadlineExceeded, true, 1, "unknown", "gmail_send_unknown"},
		{"refresh timeout", context.DeadlineExceeded, false, 1, "failed", "gmail_send_failed"},
		{"server failure", &apiError{Status: 503}, true, 1, "unknown", "gmail_send_unknown"},
		{"rate 403", &apiError{Status: 403, Body: `{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}`}, true, 1, "queued", "gmail_rate_limited"},
		{"exhausted", &apiError{Status: 429}, true, 3, "failed", "gmail_rate_limited"},
		{"permission", &apiError{Status: 403, Body: `{"error":{"errors":[{"reason":"insufficientPermissions"}]}}`}, true, 1, "failed", "gmail_permission_denied"},
		{"unauthorized", &apiError{Status: 401}, true, 1, "failed", "gmail_auth_expired"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			status, code := sendOutcome(tt.err, tt.submitted, tt.attempts)
			if status != tt.status || code != tt.code {
				t.Fatalf("%s/%s", status, code)
			}
		})
	}
	if permanentConnectionError(apiErrorCode(&apiError{Status: 403, Body: `{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}`}, "fallback")) {
		t.Fatal("rate limiting parked the connection permanently")
	}
}

func TestOutboundScopeContract(t *testing.T) {
	if hasRequiredScopes([]string{gmailReadonlyScope}) || hasRequiredScopes([]string{gmailSendScope}) || hasRequiredScopes(nil) {
		t.Fatal("partial scopes accepted")
	}
	if !hasRequiredScopes([]string{gmailSendScope, gmailReadonlyScope}) {
		t.Fatal("both scopes rejected")
	}
}
