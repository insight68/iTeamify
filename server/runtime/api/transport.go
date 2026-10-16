package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	defaultMaxRequestBytes = 16 << 20
	maxResponseBytes       = 32 << 20
	maxErrorResponseBytes  = 64 << 10
	maxRetryDelay          = 30 * time.Second
)

var ErrRequestTooLarge = errors.New("model request exceeds context byte limit")

// HTTPError retains the upstream status for callers that classify probe failures.
// Message may contain provider diagnostics and must not be exposed without redaction.
type HTTPError struct {
	StatusCode int
	Message    string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("API error (status %d): %s", e.StatusCode, e.Message)
}

func (c *Client) marshalRequest(value interface{}) ([]byte, error) {
	body, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	if len(body) > c.config.MaxRequestBytes {
		return nil, fmt.Errorf("%w (%d > %d)", ErrRequestTooLarge, len(body), c.config.MaxRequestBytes)
	}
	return body, nil
}

// Connection pools are shared across tasks; credentials remain on each request.
var sharedTransport = newTransport(false)
var isolatedTransport = newTransport(true)

func newTransport(isolated bool) *http.Transport {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxIdleConns = 100
	transport.MaxIdleConnsPerHost = 16
	if isolated {
		transport.Proxy = nil
	}
	return transport
}

// Close releases only an explicitly configured private proxy pool.
func (c *Client) Close() {
	if c.ownedTransport != nil {
		c.ownedTransport.CloseIdleConnections()
	}
}

func readBoundedResponse(reader io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if len(data) > int(limit) {
		return data[:limit], fmt.Errorf("API response exceeds %d bytes", limit)
	}
	return data, err
}

func retryDelay(value string, attempt int) time.Duration {
	delay := time.Duration(attempt*attempt) * time.Second
	if seconds, err := strconv.ParseInt(value, 10, 64); err == nil && seconds >= 0 {
		if seconds >= int64(maxRetryDelay/time.Second) {
			return maxRetryDelay
		}
		delay = time.Duration(seconds) * time.Second
	} else if deadline, err := http.ParseTime(value); err == nil {
		delay = time.Until(deadline)
	}
	if delay < 0 {
		return 0
	}
	if delay > maxRetryDelay {
		return maxRetryDelay
	}
	return delay
}

// doRequest retries only before a response stream is exposed to consumers.
// Model content and tool side effects are never replayed by this transport.
func (c *Client) doRequest(ctx context.Context, path string, body []byte, headers http.Header) (*http.Response, error) {
	requestID := uuid.New().String()
	var delay time.Duration
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if attempt > 0 {
			timer := time.NewTimer(delay)
			select {
			case <-timer.C:
			case <-ctx.Done():
				timer.Stop()
				return nil, ctx.Err()
			}
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.config.BaseURL, "/")+path, bytes.NewReader(body))
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}
		req.Header = headers.Clone()
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Client-Request-Id", requestID)
		for key, value := range c.config.CustomHeaders {
			req.Header.Set(key, value)
		}
		resp, err := c.config.HTTPClient.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if attempt < maxRetries && isRetryableError(err) {
				delay = retryDelay("", attempt+1)
				continue
			}
			return nil, fmt.Errorf("send request: %w", err)
		}
		if attempt < maxRetries && (resp.StatusCode == 429 || resp.StatusCode == 529 || resp.StatusCode >= 500) {
			delay = retryDelay(resp.Header.Get("Retry-After"), attempt+1)
			stopClose := context.AfterFunc(ctx, func() { _ = resp.Body.Close() })
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxErrorResponseBytes))
			stopClose()
			_ = resp.Body.Close()
			continue
		}
		return resp, nil
	}
	return nil, fmt.Errorf("API retries exhausted")
}
