// Package gmail implements iTeamify's native, user-owned Gmail connection.
// Credentials are never exposed outside this package; callers receive only
// connection health and analysis metadata.
package gmail

import (
	"errors"
	"time"
)

var (
	ErrNotConfigured      = errors.New("gmail: integration not configured")
	ErrInvalidOAuthState  = errors.New("gmail: invalid or expired oauth state")
	ErrConnectionNotFound = errors.New("gmail: connection not found")
	ErrPushUnauthorized   = errors.New("gmail: push request unauthorized")
)

const (
	gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly"
	gmailSendScope     = "https://www.googleapis.com/auth/gmail.send"
	maxStoredBodyRunes = 64_000
	maxAnalysisRunes   = 16_000
)

type Config struct {
	ClientID              string
	ClientSecret          string
	CallbackURL           string
	FrontendURL           string
	PubSubTopic           string
	PushAudience          string
	PushServiceAccount    string
	PushVerificationToken string
	OAuthStateTTL         time.Duration
	PollInterval          time.Duration
	HTTPTimeout           time.Duration
}

func (c Config) OAuthEnabled() bool {
	return c.ClientID != "" && c.ClientSecret != "" && c.CallbackURL != ""
}

func (c Config) PushEnabled() bool {
	hasOIDC := c.PushAudience != "" && c.PushServiceAccount != ""
	return c.PubSubTopic != "" && (c.PushVerificationToken != "" || hasOIDC)
}

type Connection struct {
	CanSend         bool       `json:"can_send"`
	ID              string     `json:"id"`
	EmailAddress    string     `json:"email_address"`
	Status          string     `json:"status"`
	AnalysisEnabled bool       `json:"analysis_enabled"`
	MessageCount    int64      `json:"message_count"`
	AnalyzedCount   int64      `json:"analyzed_count"`
	ConnectedAt     time.Time  `json:"connected_at"`
	LastSyncAt      *time.Time `json:"last_sync_at"`
	WatchExpiration *time.Time `json:"watch_expiration"`
	LastErrorCode   *string    `json:"last_error_code"`
}

type OAuthResult struct {
	ErrorCode    string
	ConnectionID string
	EmailAddress string
	ReturnPath   string
}

type AnalysisResult struct {
	Category        string  `json:"category"`
	Priority        string  `json:"priority"`
	ActionRequired  bool    `json:"action_required"`
	Summary         string  `json:"summary"`
	SuggestedAction string  `json:"suggested_action"`
	Confidence      float64 `json:"confidence"`
}

type PushEnvelope struct {
	Message struct {
		Data      string `json:"data"`
		MessageID string `json:"messageId"`
	} `json:"message"`
	Subscription string `json:"subscription"`
}

type PushData struct {
	EmailAddress string `json:"emailAddress"`
	HistoryID    string `json:"historyId"`
}
