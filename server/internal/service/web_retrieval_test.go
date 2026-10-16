package service

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func webTestService(t *testing.T, fn http.HandlerFunc) *WebRetrievalService {
	t.Helper()
	server := httptest.NewServer(fn)
	t.Cleanup(server.Close)
	s := NewWebRetrievalService("test-secret")
	s.baseURL = server.URL
	return s
}

func requireWebError(t *testing.T, err error, code string) {
	t.Helper()
	var failure *WebRetrievalError
	if !errors.As(err, &failure) || failure.Code != code {
		t.Fatalf("error = %v, want %s", err, code)
	}
	if strings.Contains(err.Error(), "test-secret") {
		t.Fatal("provider secret leaked")
	}
}

func TestWebSearchReturnsBoundedCitedSourcesAndKeepsCredentialsBackendOnly(t *testing.T) {
	s := webTestService(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/search" || r.Header.Get("Authorization") != "Bearer test-secret" {
			t.Errorf("wrong provider request")
		}
		var request map[string]any
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		if request["max_results"] != float64(5) || request["include_answer"] != false || request["include_raw_content"] != false || request["time_range"] != nil {
			t.Errorf("search request = %#v", request)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"results": []any{
			map[string]any{"title": "Company", "url": "https://example.com/about", "content": strings.Repeat("中", 6001)},
			map[string]any{"title": "private", "url": "http://127.0.0.1/internal", "content": "private"},
		}})
	})
	result, err := s.Search(context.Background(), WebSearchInput{Query: "  manufacturing companies  "})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Sources) != 1 || result.Query != "manufacturing companies" || !result.Sources[0].Truncated || len([]rune(result.Sources[0].Content)) != 6000 || result.Sources[0].ObservedAt == "" || result.EvidencePolicy == "" {
		t.Fatalf("result = %#v", result)
	}
}

func TestWebFetchChecksPartialSuccessAndReportsSpecificFailures(t *testing.T) {
	for _, tc := range []struct{ body, code string }{
		{`{"results":[],"failed_results":[{"error":"Login authentication required"}]}`, "web_page_login_required"},
		{`{"results":[],"failed_results":[{"error":"CAPTCHA challenge"}]}`, "web_page_captcha"},
		{`{"results":[],"failed_results":[{"error":"Failed to retrieve content test-secret"}]}`, "web_page_unavailable"},
		{`{}`, "web_provider_invalid_response"},
	} {
		t.Run(tc.code, func(t *testing.T) {
			s := webTestService(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(tc.body)) })
			_, err := s.Fetch(context.Background(), WebFetchInput{URL: "https://example.com/about"})
			requireWebError(t, err, tc.code)
		})
	}
	s := webTestService(t, func(w http.ResponseWriter, r *http.Request) {
		var request map[string]any
		_ = json.NewDecoder(r.Body).Decode(&request)
		if r.URL.Path != "/extract" || request["format"] != "markdown" || request["headers"] != nil {
			t.Errorf("extract request = %#v", request)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"results": []any{map[string]string{"url": "https://example.com/about", "raw_content": strings.Repeat("a", 24001)}}})
	})
	result, err := s.Fetch(context.Background(), WebFetchInput{URL: "https://example.com/about"})
	if err != nil || !result.Truncated || len(result.Content) != 24000 || result.ObservedAt == "" {
		t.Fatalf("result = %#v, error = %v", result, err)
	}
}

func TestWebProviderFailuresAreSanitized(t *testing.T) {
	for _, tc := range []struct {
		status int
		code   string
	}{
		{401, "web_provider_auth_failed"}, {403, "web_provider_auth_failed"}, {429, "web_provider_rate_limited"}, {432, "web_provider_rate_limited"}, {433, "web_provider_rate_limited"}, {500, "web_provider_unavailable"}, {302, "web_provider_unavailable"},
	} {
		t.Run(tc.code+http.StatusText(tc.status), func(t *testing.T) {
			s := webTestService(t, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Location", "http://127.0.0.1/secret")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte("test-secret"))
			})
			_, err := s.Search(context.Background(), WebSearchInput{Query: "test"})
			requireWebError(t, err, tc.code)
		})
	}
	for _, body := range []string{`null`, `{}`, `{"results":null}`, `invalid`} {
		s := webTestService(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(body)) })
		_, err := s.Search(context.Background(), WebSearchInput{Query: "test"})
		requireWebError(t, err, "web_provider_invalid_response")
	}
	_, err := NewWebRetrievalService("").Search(context.Background(), WebSearchInput{Query: "test"})
	requireWebError(t, err, "web_search_not_configured")
}

func TestWebRetrievalRejectsUnsafeInputsBeforeProviderCall(t *testing.T) {
	s := webTestService(t, func(w http.ResponseWriter, r *http.Request) { t.Error("provider called for rejected input") })
	for _, input := range []WebSearchInput{{}, {Query: strings.Repeat("x", 1001)}, {Query: "test", MaxResults: 11}, {Query: "test", MaxResults: -1}} {
		_, err := s.Search(context.Background(), input)
		requireWebError(t, err, "invalid_web_query")
	}
	for _, raw := range []string{"file:///etc/passwd", "http://localhost", "http://127.0.0.1/x", "http://127.1/x", "http://0177.0.0.1/x", "https://10.0.0.1/", "http://169.254.169.254/", "https://[::1]/", "https://user:pass@example.com/", "https://example.internal/", "https://example.com:8443/", "http://2130706433/"} {
		_, err := s.Fetch(context.Background(), WebFetchInput{URL: raw})
		requireWebError(t, err, "invalid_web_url")
	}
}

func TestWebRetrievalBoundsProviderResponseAndHonorsCancellation(t *testing.T) {
	s := webTestService(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"results": []any{map[string]string{"url": "https://example.com", "content": strings.Repeat("a", 2<<20)}}})
	})
	_, err := s.Search(context.Background(), WebSearchInput{Query: "test"})
	requireWebError(t, err, "web_provider_invalid_response")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = s.Search(ctx, WebSearchInput{Query: "test"})
	requireWebError(t, err, "web_request_cancelled")
}
