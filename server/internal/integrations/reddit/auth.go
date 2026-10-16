package reddit

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// oauthClient wraps the shared Reddit OAuth plumbing: automatic access_token
// refresh from the stored refresh_token, and rate-limit-aware request execution.
// Credentials are decrypted only at the workspace connection boundary.
type oauthClient struct {
	clientID       string
	clientSecret   string
	refreshToken   string
	userAgent      string
	beforeRequest  func(context.Context) error
	afterResponse  func(context.Context, *http.Response) error
	persistRefresh func(context.Context, string) error

	// OAuthHost / APIHost allow tests to point at an httptest server.
	OAuthHost string
	APIHost   string

	httpClient *http.Client

	mu          sync.Mutex
	cachedToken string
	tokenExpiry time.Time
}

// newOAuthClient builds a client from decrypted credentials. The caller is
// responsible for supplying a valid refresh_token.
func newOAuthClient(clientID, clientSecret, refreshToken, userAgent string) *oauthClient {
	return &oauthClient{
		clientID:     clientID,
		clientSecret: clientSecret,
		refreshToken: refreshToken,
		userAgent:    userAgent,
		httpClient:   http.DefaultClient,
	}
}

// token returns a valid OAuth access_token, refreshing if needed. Safe for
// concurrent use (one refresh at a time).
func (o *oauthClient) token(ctx context.Context) (string, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	// Refresh proactively 60s before expiry to avoid races near the boundary.
	if o.cachedToken != "" && time.Until(o.tokenExpiry) > 60*time.Second {
		return o.cachedToken, nil
	}
	return o.refresh(ctx)
}

// refresh exchanges the refresh_token for a new access_token. Called under mu.
func (o *oauthClient) refresh(ctx context.Context) (string, error) {
	oauthHost := o.OAuthHost
	if oauthHost == "" {
		oauthHost = redditOAuthHost
	}

	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", o.refreshToken)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, oauthHost+tokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", o.userAgent)
	if o.beforeRequest != nil {
		if err := o.beforeRequest(ctx); err != nil {
			return "", err
		}
	}
	req.SetBasicAuth(o.clientID, o.clientSecret)

	client := o.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("reddit token refresh status %d", resp.StatusCode)
	}

	var token tokenResponse
	if err := json.Unmarshal(body, &token); err != nil {
		return "", fmt.Errorf("decode token refresh response: %w", err)
	}

	if token.AccessToken == "" || token.ExpiresIn <= 0 {
		return "", ErrPermission
	}
	o.cachedToken = token.AccessToken
	o.tokenExpiry = time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)
	// Reddit's refresh_token is opaque; a refresh may issue a new one. Persist it before using it.
	if token.RefreshToken != "" && token.RefreshToken != o.refreshToken {
		if o.persistRefresh != nil {
			if err := o.persistRefresh(ctx, token.RefreshToken); err != nil {
				o.cachedToken = ""
				return "", err
			}
		}
		o.refreshToken = token.RefreshToken
	}

	return o.cachedToken, nil
}

// do executes an authenticated request: injects Bearer access_token + User-Agent,
// auto-refreshes on 401, and returns the raw response.
func (o *oauthClient) do(ctx context.Context, method, path string, body interface{}) (*http.Response, error) {
	apiHost := o.APIHost
	if apiHost == "" {
		apiHost = redditAPIBase
	}

	var encoded string
	contentType := "application/json"
	if body != nil {
		switch v := body.(type) {
		case url.Values:
			encoded = v.Encode()
			contentType = "application/x-www-form-urlencoded"
		case []byte:
			encoded = string(v)
		case string:
			encoded = v
		default:
			b, err := json.Marshal(v)
			if err != nil {
				return nil, err
			}
			encoded = string(b)
		}
	}
	client := o.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	for attempt := 0; attempt < 2; attempt++ {
		token, err := o.token(ctx)
		if err != nil {
			return nil, err
		}
		if o.beforeRequest != nil {
			if err = o.beforeRequest(ctx); err != nil {
				return nil, err
			}
		}
		req, err := http.NewRequestWithContext(ctx, method, apiHost+path, strings.NewReader(encoded))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", contentType)
		req.Header.Set("User-Agent", o.userAgent)
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		if o.afterResponse != nil {
			if err = o.afterResponse(ctx, resp); err != nil {
				resp.Body.Close()
				return nil, err
			}
		}
		if resp.StatusCode == http.StatusUnauthorized && attempt == 0 {
			resp.Body.Close()
			o.mu.Lock()
			o.cachedToken = ""
			o.tokenExpiry = time.Time{}
			o.mu.Unlock()
			continue
		}
		return resp, nil
	}
	return nil, ErrPermission
}
