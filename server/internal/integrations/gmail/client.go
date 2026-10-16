package gmail

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/sync/singleflight"

	"github.com/iteamify-ai/iteamify/server/internal/util/secretbox"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
)

const (
	googleTokenURL  = "https://oauth2.googleapis.com/token"
	googleRevokeURL = "https://oauth2.googleapis.com/revoke"
	gmailAPIBase    = "https://gmail.googleapis.com/gmail/v1"
)

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
	Scope        string `json:"scope"`
	TokenType    string `json:"token_type"`
}

type profileResponse struct {
	EmailAddress string `json:"emailAddress"`
	HistoryID    string `json:"historyId"`
}

type watchResponse struct {
	HistoryID  string `json:"historyId"`
	Expiration string `json:"expiration"`
}

type historyResponse struct {
	History []struct {
		ID            string `json:"id"`
		MessagesAdded []struct {
			Message messageRef `json:"message"`
		} `json:"messagesAdded"`
	} `json:"history"`
	NextPageToken string `json:"nextPageToken"`
	HistoryID     string `json:"historyId"`
}

type messageRef struct {
	ID       string   `json:"id"`
	ThreadID string   `json:"threadId"`
	LabelIDs []string `json:"labelIds"`
}

type messageResponse struct {
	ID           string      `json:"id"`
	ThreadID     string      `json:"threadId"`
	LabelIDs     []string    `json:"labelIds"`
	Snippet      string      `json:"snippet"`
	HistoryID    string      `json:"historyId"`
	InternalDate string      `json:"internalDate"`
	SizeEstimate int64       `json:"sizeEstimate"`
	Payload      messagePart `json:"payload"`
}

type messagePart struct {
	MimeType string `json:"mimeType"`
	Filename string `json:"filename"`
	Headers  []struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	} `json:"headers"`
	Body struct {
		Data string `json:"data"`
		Size int64  `json:"size"`
	} `json:"body"`
	Parts []messagePart `json:"parts"`
}

type messagesListResponse struct {
	Messages      []messageRef `json:"messages"`
	NextPageToken string       `json:"nextPageToken"`
}

type apiError struct {
	Status     int
	Body       string
	RetryAfter time.Duration
}

func (e *apiError) Error() string { return fmt.Sprintf("gmail API returned status %d", e.Status) }

type cachedAccessToken struct {
	token     string
	expiresAt time.Time
}

type apiClient struct {
	config Config
	box    *secretbox.Box
	http   *http.Client

	mu     sync.RWMutex
	tokens map[string]cachedAccessToken
	group  singleflight.Group
}

func newAPIClient(config Config, box *secretbox.Box, transport http.RoundTripper) *apiClient {
	client := &http.Client{Timeout: config.HTTPTimeout}
	if transport != nil {
		client.Transport = transport
	}
	return &apiClient{config: config, box: box, http: client, tokens: make(map[string]cachedAccessToken)}
}

func (c *apiClient) exchangeCode(ctx context.Context, code string) (tokenResponse, error) {
	values := url.Values{
		"code":          {code},
		"client_id":     {c.config.ClientID},
		"client_secret": {c.config.ClientSecret},
		"redirect_uri":  {c.config.CallbackURL},
		"grant_type":    {"authorization_code"},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, googleTokenURL, strings.NewReader(values.Encode()))
	if err != nil {
		return tokenResponse{}, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	var result tokenResponse
	if err := c.doJSON(request, &result); err != nil {
		return tokenResponse{}, fmt.Errorf("exchange authorization code: %w", err)
	}
	if strings.TrimSpace(result.AccessToken) == "" {
		return tokenResponse{}, errors.New("gmail: token response missing access token")
	}
	return result, nil
}

func (c *apiClient) accessToken(ctx context.Context, connection db.UserGmailConnection) (string, error) {
	key := connection.ID.String()
	now := time.Now()
	c.mu.RLock()
	cached, ok := c.tokens[key]
	c.mu.RUnlock()
	if ok && cached.expiresAt.After(now.Add(time.Minute)) {
		return cached.token, nil
	}

	value, err, _ := c.group.Do(key, func() (any, error) {
		c.mu.RLock()
		cached, ok := c.tokens[key]
		c.mu.RUnlock()
		if ok && cached.expiresAt.After(time.Now().Add(time.Minute)) {
			return cached.token, nil
		}
		refreshToken, err := c.box.Open(connection.RefreshTokenCiphertext)
		if err != nil {
			return "", fmt.Errorf("open refresh token: %w", err)
		}
		values := url.Values{
			"refresh_token": {string(refreshToken)},
			"client_id":     {c.config.ClientID},
			"client_secret": {c.config.ClientSecret},
			"grant_type":    {"refresh_token"},
		}
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, googleTokenURL, strings.NewReader(values.Encode()))
		if err != nil {
			return "", err
		}
		request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		var response tokenResponse
		if err := c.doJSON(request, &response); err != nil {
			return "", fmt.Errorf("refresh access token: %w", err)
		}
		if response.AccessToken == "" {
			return "", errors.New("gmail: refresh response missing access token")
		}
		expiresAt := time.Now().Add(time.Duration(response.ExpiresIn) * time.Second)
		c.mu.Lock()
		c.tokens[key] = cachedAccessToken{token: response.AccessToken, expiresAt: expiresAt}
		c.mu.Unlock()
		return response.AccessToken, nil
	})
	if err != nil {
		return "", err
	}
	return value.(string), nil
}

func (c *apiClient) rememberAccessToken(connectionID pgtype.UUID, token string, expiresIn int64) {
	if strings.TrimSpace(token) == "" {
		return
	}
	if expiresIn <= 0 {
		expiresIn = 3600
	}
	c.mu.Lock()
	c.tokens[connectionID.String()] = cachedAccessToken{
		token: token, expiresAt: time.Now().Add(time.Duration(expiresIn) * time.Second),
	}
	c.mu.Unlock()
}

func (c *apiClient) profile(ctx context.Context, accessToken string) (profileResponse, error) {
	var result profileResponse
	if err := c.gmailJSON(ctx, http.MethodGet, "/users/me/profile", accessToken, nil, &result); err != nil {
		return profileResponse{}, err
	}
	return result, nil
}

func (c *apiClient) watch(ctx context.Context, accessToken string) (watchResponse, error) {
	if strings.TrimSpace(c.config.PubSubTopic) == "" {
		return watchResponse{}, ErrNotConfigured
	}
	payload := map[string]any{
		"topicName":           c.config.PubSubTopic,
		"labelIds":            []string{"INBOX"},
		"labelFilterBehavior": "include",
	}
	var result watchResponse
	if err := c.gmailJSON(ctx, http.MethodPost, "/users/me/watch", accessToken, payload, &result); err != nil {
		return watchResponse{}, err
	}
	return result, nil
}

func (c *apiClient) revoke(ctx context.Context, connection db.UserGmailConnection) error {
	refreshToken, err := c.box.Open(connection.RefreshTokenCiphertext)
	if err != nil {
		return fmt.Errorf("open refresh token for revocation: %w", err)
	}
	values := url.Values{"token": {string(refreshToken)}}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, googleRevokeURL, strings.NewReader(values.Encode()))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := c.http.Do(request)
	if err != nil {
		return fmt.Errorf("revoke authorization: %w", err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4<<10))
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("revoke authorization returned status %d", response.StatusCode)
	}
	return nil
}

func (c *apiClient) forget(connectionID pgtype.UUID) {
	c.mu.Lock()
	delete(c.tokens, connectionID.String())
	c.mu.Unlock()
}

func (c *apiClient) history(ctx context.Context, accessToken, startHistoryID, pageToken string) (historyResponse, error) {
	query := url.Values{
		"startHistoryId": {startHistoryID},
		"historyTypes":   {"messageAdded"},
		"labelId":        {"INBOX"},
		"maxResults":     {"500"},
	}
	if pageToken != "" {
		query.Set("pageToken", pageToken)
	}
	var result historyResponse
	path := "/users/me/history?" + query.Encode()
	if err := c.gmailJSON(ctx, http.MethodGet, path, accessToken, nil, &result); err != nil {
		return historyResponse{}, err
	}
	return result, nil
}

func (c *apiClient) getMessage(ctx context.Context, accessToken, messageID string) (messageResponse, error) {
	path := "/users/me/messages/" + url.PathEscape(messageID) + "?format=full"
	var result messageResponse
	if err := c.gmailJSON(ctx, http.MethodGet, path, accessToken, nil, &result); err != nil {
		return messageResponse{}, err
	}
	return result, nil
}

func (c *apiClient) listMessagesSince(ctx context.Context, accessToken string, since time.Time, pageToken string) (messagesListResponse, error) {
	query := url.Values{
		"labelIds":   {"INBOX"},
		"maxResults": {"500"},
		"q":          {"after:" + strconv.FormatInt(since.Unix(), 10)},
	}
	if pageToken != "" {
		query.Set("pageToken", pageToken)
	}
	var result messagesListResponse
	if err := c.gmailJSON(ctx, http.MethodGet, "/users/me/messages?"+query.Encode(), accessToken, nil, &result); err != nil {
		return messagesListResponse{}, err
	}
	return result, nil
}

func (c *apiClient) gmailJSON(ctx context.Context, method, path, token string, body any, target any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, gmailAPIBase+path, reader)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/json")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	return c.doJSON(request, target)
}

func (c *apiClient) doJSON(request *http.Request, target any) error {
	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var retryAfter time.Duration
		if seconds, err := strconv.ParseInt(response.Header.Get("Retry-After"), 10, 64); err == nil && seconds > 0 {
			retryAfter = time.Duration(min(seconds, 86400)) * time.Second
		} else if when, err := http.ParseTime(response.Header.Get("Retry-After")); err == nil {
			retryAfter = max(0, min(time.Until(when), 24*time.Hour))
		}
		return &apiError{Status: response.StatusCode, Body: string(body), RetryAfter: retryAfter}
	}
	if target == nil || len(bytes.TrimSpace(body)) == 0 {
		return nil
	}
	if err := json.Unmarshal(body, target); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

func watchExpiration(value string) (pgtype.Timestamptz, error) {
	milliseconds, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return pgtype.Timestamptz{}, fmt.Errorf("parse watch expiration: %w", err)
	}
	return pgtype.Timestamptz{Time: time.UnixMilli(milliseconds), Valid: true}, nil
}
