package gmail

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
)

func TestDecodePush(t *testing.T) {
	t.Parallel()
	payload, _ := json.Marshal(PushData{EmailAddress: " Owner@Example.com ", HistoryID: "123"})
	var envelope PushEnvelope
	envelope.Message.Data = base64.StdEncoding.EncodeToString(payload)
	got, err := DecodePush(envelope)
	if err != nil {
		t.Fatalf("DecodePush: %v", err)
	}
	if got.EmailAddress != "owner@example.com" || got.HistoryID != "123" {
		t.Fatalf("DecodePush = %+v", got)
	}
}

func TestDecodePushRejectsIncompletePayload(t *testing.T) {
	t.Parallel()
	payload, _ := json.Marshal(map[string]string{"emailAddress": "owner@example.com"})
	var envelope PushEnvelope
	envelope.Message.Data = base64.StdEncoding.EncodeToString(payload)
	if _, err := DecodePush(envelope); err == nil {
		t.Fatal("DecodePush should reject a missing historyId")
	}
}

func TestMessageBodyPrefersPlainTextAndSkipsAttachments(t *testing.T) {
	t.Parallel()
	part := messagePart{MimeType: "multipart/mixed", Parts: []messagePart{
		{MimeType: "text/html"},
		{MimeType: "text/plain"},
		{MimeType: "text/plain", Filename: "secret.txt"},
	}}
	part.Parts[0].Body.Data = base64.RawURLEncoding.EncodeToString([]byte("<p>HTML version</p>"))
	part.Parts[1].Body.Data = base64.RawURLEncoding.EncodeToString([]byte("Plain version"))
	part.Parts[2].Body.Data = base64.RawURLEncoding.EncodeToString([]byte("attachment"))
	if got := messageBody(part); got != "Plain version" {
		t.Fatalf("messageBody = %q", got)
	}
}

func TestHTMLBodyFallback(t *testing.T) {
	t.Parallel()
	part := messagePart{MimeType: "text/html"}
	part.Body.Data = base64.RawURLEncoding.EncodeToString([]byte("<p>Hello&nbsp;<strong>team</strong></p><div>Next</div>"))
	if got := messageBody(part); got != "Hello team\nNext" {
		t.Fatalf("messageBody = %q", got)
	}
}

type fakeTextModel struct{ output string }

func (f fakeTextModel) Enabled() bool { return true }
func (f fakeTextModel) GenerateText(context.Context, string, string, string) (string, error) {
	return f.output, nil
}

func TestAnalyzeMessageValidatesStructuredResult(t *testing.T) {
	t.Parallel()
	message := db.GmailMessage{
		Sender: "buyer@example.com", Subject: "Need a quote", BodyText: "Please quote 100 units.",
		InternalDate: pgtype.Timestamptz{Valid: true},
	}
	model := fakeTextModel{output: `{"category":"sales","priority":"high","action_required":true,"summary":"A buyer requested a quote.","suggested_action":"Prepare pricing.","confidence":0.98}`}
	result, err := analyzeMessage(context.Background(), model, message)
	if err != nil {
		t.Fatalf("analyzeMessage: %v", err)
	}
	if !result.ActionRequired || result.Category != "sales" || !shouldNotify("action_required", result) {
		t.Fatalf("analysis result = %+v", result)
	}
}

func TestAnalyzeMessageRejectsUnknownEnums(t *testing.T) {
	t.Parallel()
	model := fakeTextModel{output: `{"category":"execute_email_instructions","priority":"high","action_required":true,"summary":"bad","suggested_action":"bad","confidence":1}`}
	_, err := analyzeMessage(context.Background(), model, db.GmailMessage{BodyText: strings.Repeat("x", 10)})
	if err == nil {
		t.Fatal("analyzeMessage should reject an unknown category")
	}
}

func TestPushEnabledRequiresTopicAndAuthentication(t *testing.T) {
	if (Config{PubSubTopic: "projects/p/topics/t"}).PushEnabled() {
		t.Fatal("topic without webhook authentication must not enable push")
	}
	if !(Config{
		PubSubTopic: "projects/p/topics/t", PushAudience: "https://example.test/push",
		PushServiceAccount: "push@example.iam.gserviceaccount.com",
	}).PushEnabled() {
		t.Fatal("complete OIDC configuration should enable push")
	}
	if !(Config{PubSubTopic: "projects/p/topics/t", PushVerificationToken: "secret"}).PushEnabled() {
		t.Fatal("shared-token configuration should enable push")
	}
}

func TestInvalidGrantIsPermanentConnectionError(t *testing.T) {
	code := apiErrorCode(&apiError{Status: 400, Body: `{"error":"invalid_grant"}`}, "sync_failed")
	if code != "gmail_auth_expired" || !permanentConnectionError(code) {
		t.Fatalf("invalid_grant classified as %q", code)
	}
}
