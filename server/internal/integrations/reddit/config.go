// Package reddit implements workspace-scoped public reads and human-approved replies.
package reddit

const (
	redditOAuthHost = "https://www.reddit.com"
	redditAPIBase   = "https://oauth.reddit.com"
	tokenEndpoint   = "/api/v1/access_token"
	apiComment      = "/api/comment"
)

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	Scope        string `json:"scope"`
}
