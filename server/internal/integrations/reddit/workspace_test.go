package reddit

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type redditTransport func(*http.Request) (*http.Response, error)

func (f redditTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func redditHTTP(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}
}
func testClient(f redditTransport) *oauthClient {
	c := newOAuthClient("client", "secret", "refresh", "test:v1 (by /u/bot)")
	c.cachedToken = "access"
	c.tokenExpiry = time.Now().Add(time.Hour)
	c.httpClient = &http.Client{Transport: f}
	return c
}

const goodReceipt = `{"json":{"errors":[],"data":{"things":[{"kind":"t1","data":{"name":"t1_receipt","parent_id":"t3_post","author":"bot"}}]}}}`

func TestRedditCommentReceiptAndUnknown(t *testing.T) {
	for _, tc := range []struct {
		name, body        string
		status            int
		success, rejected bool
	}{
		{"receipt", goodReceipt, 200, true, false}, {"html", "<html>gateway</html>", 200, false, false}, {"empty", "{}", 200, false, false},
		{"wrong_parent", strings.ReplaceAll(goodReceipt, "t3_post", "t3_else"), 200, false, false},
		{"empty_error", `{"json":{"errors":[[]]}}`, 200, false, false},
		{"rate_envelope", `{"json":{"errors":[["RATELIMIT","wait"]]}}`, 200, false, true}, {"http_rate", "", 429, false, true}, {"server_error", "", 503, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			c := testClient(func(r *http.Request) (*http.Response, error) {
				calls++
				if err := r.ParseForm(); err != nil {
					t.Fatal(err)
				}
				if r.Form.Get("thing_id") != "t3_post" || r.Form.Get("parent") != "" || r.Form.Get("api_type") != "json" || r.Form.Get("text") != "hello" {
					t.Fatalf("invalid reply form: %v", r.Form)
				}
				return redditHTTP(tc.status, tc.body), nil
			})
			got, err := submitComment(context.Background(), c, "t3_post", "hello", "bot")
			if (got != "") == !tc.success || (err == nil) != tc.success {
				t.Fatalf("receipt=%s error=%v", got, err)
			}
			var reject *commentRejected
			if errors.As(err, &reject) != tc.rejected {
				t.Fatalf("rejected=%v error=%v", tc.rejected, err)
			}
			if calls != 1 {
				t.Fatalf("submission retried %d times", calls)
			}
		})
	}
}
func TestReddit401ReconstructsBody(t *testing.T) {
	posts, refresh := 0, 0
	c := testClient(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == tokenEndpoint {
			refresh++
			return redditHTTP(200, `{"access_token":"new","expires_in":3600}`), nil
		}
		b, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(b), "thing_id=t3_post") {
			t.Fatal("missing replay body")
		}
		posts++
		if posts == 1 {
			return redditHTTP(401, ""), nil
		}
		return redditHTTP(200, goodReceipt), nil
	})
	if _, err := submitComment(context.Background(), c, "t3_post", "hello", "bot"); err != nil {
		t.Fatal(err)
	}
	if posts != 2 || refresh != 1 {
		t.Fatal("incorrect refresh sequence")
	}
}
func TestRedditPublicScopeAndContentVersion(t *testing.T) {
	for _, body := range []string{`{"data":{"subreddit_type":"private"}}`, `{"data":{"subreddit_type":"public","over18":true}}`, `{"data":{"subreddit_type":"public","quarantine":true}}`, `{}`} {
		c := testClient(func(*http.Request) (*http.Response, error) { return redditHTTP(200, body), nil })
		if !errors.Is(publicSub(context.Background(), c, "SaaS"), ErrUnavailable) {
			t.Fatalf("accepted %s", body)
		}
	}
	var thing contentThing
	_ = json.Unmarshal([]byte(`{"kind":"t3","data":{"name":"t3_post","subreddit":"SaaS","title":"Need help","selftext":"Question","author":"buyer"}}`), &thing)
	one, ok := normalizeContent(thing)
	if !ok {
		t.Fatal("rejected post")
	}
	thing.Data.Score = 200
	two, _ := normalizeContent(thing)
	if one.Version != two.Version {
		t.Fatal("score invalidated content")
	}
	thing.Data.Selftext = "Edited"
	three, _ := normalizeContent(thing)
	if three.Version == one.Version {
		t.Fatal("edit undetected")
	}
	thing.Data.Selftext = "[deleted]"
	if _, ok := normalizeContent(thing); ok {
		t.Fatal("retained deleted content")
	}
}
func TestRedditScopesAndBudget(t *testing.T) {
	if hasScopes("identity", false) || hasScopes("identity read", true) || !hasScopes("identity read", false) || !hasScopes("identity,read,submit", true) || !hasScopes("*", true) {
		t.Fatal("scope validation")
	}
	if validBody("") || validBody(strings.Repeat("中", 9501)) || !validBody(strings.Repeat("中", 9500)) {
		t.Fatal("reply length")
	}
	calls := 0
	c := testClient(func(*http.Request) (*http.Response, error) { calls++; return redditHTTP(200, "{}"), nil })
	c.beforeRequest = func(context.Context) error { return ErrRateLimited }
	if _, err := submitComment(context.Background(), c, "t3_post", "hello", "bot"); !errors.Is(err, ErrRateLimited) || calls != 0 {
		t.Fatal("budget dispatch bypass")
	}
}
