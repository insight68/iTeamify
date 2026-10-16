package handler

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"time"

	runtimeapi "github.com/codeany-ai/open-agent-sdk-go/api"
	"github.com/codeany-ai/open-agent-sdk-go/types"
	"github.com/iteamify-ai/iteamify/server/internal/openagentendpoint"
)

type OpenAgentEndpoint struct{ BaseURL, Model, APIKey string }
type OpenAgentEndpointTester interface {
	Test(context.Context, OpenAgentEndpoint) error
}

type liveOpenAgentEndpointTester struct{ httpClient *http.Client }

var errOpenAgentInvalidResponse = errors.New("provider returned an invalid Anthropic message")

func (t liveOpenAgentEndpointTester) Test(ctx context.Context, e OpenAgentEndpoint) error {
	httpClient := t.httpClient
	if httpClient == nil {
		httpClient = openagentendpoint.NewHTTPClient(15 * time.Second)
	}
	defer httpClient.CloseIdleConnections()
	client := runtimeapi.NewClient(runtimeapi.ClientConfig{
		APIKey: e.APIKey, BaseURL: e.BaseURL, Model: e.Model,
		Provider: runtimeapi.ProviderAnthropic, MaxTokens: 1,
		DisallowProcessEnv: true, HTTPClient: httpClient,
	})
	message, err := client.CreateMessage(ctx, runtimeapi.MessagesRequest{Model: e.Model, MaxTokens: 1, Messages: []runtimeapi.APIMessage{{Role: "user", Content: []types.ContentBlock{{Type: types.ContentBlockText, Text: "Reply with OK."}}}}})
	if err != nil {
		return err
	}
	if message == nil || message.Type != "message" || message.Role != "assistant" || message.Model == "" || message.Usage == nil || message.StopReason == "" {
		return errOpenAgentInvalidResponse
	}
	return nil
}

type openAgentProbeResult struct {
	OK             bool   `json:"ok"`
	Code           string `json:"code,omitempty"`
	Error          string `json:"error,omitempty"`
	UpstreamStatus int    `json:"upstream_status,omitempty"`
}

// Only canonical diagnostics leave the server. A provider can echo credentials
// in an error body, so neither raw errors nor upstream payloads belong here.
func openAgentProbeFailure(err error) openAgentProbeResult {
	result := openAgentProbeResult{Code: "connection_error", Error: "The model provider could not be reached."}
	var httpErr *runtimeapi.HTTPError
	var networkErr net.Error
	var dnsErr *net.DNSError
	var authorityErr x509.UnknownAuthorityError
	var hostnameErr x509.HostnameError
	var certificateErr x509.CertificateInvalidError
	var syntaxErr *json.SyntaxError
	var typeErr *json.UnmarshalTypeError
	switch {
	case errors.Is(err, context.DeadlineExceeded) || errors.As(err, &networkErr) && networkErr.Timeout():
		result.Code, result.Error = "timeout", "The model provider connection timed out."
	case errors.Is(err, openagentendpoint.ErrNonPublicAddress):
		result.Code, result.Error = "network_policy", "The provider hostname resolves to a private or reserved address. Adjust proxy or Fake-IP DNS settings to return the provider public IP."
	case errors.Is(err, openagentendpoint.ErrDNSResolution) || errors.As(err, &dnsErr):
		result.Code, result.Error = "dns_error", "The provider hostname could not be resolved."
	case errors.As(err, &authorityErr) || errors.As(err, &hostnameErr) || errors.As(err, &certificateErr):
		result.Code, result.Error = "tls_error", "The provider HTTPS certificate could not be verified."
	case errors.Is(err, errOpenAgentInvalidResponse) || errors.As(err, &syntaxErr) || errors.As(err, &typeErr):
		result.Code, result.Error = "invalid_response", "The endpoint did not return a valid Anthropic API response."
	case errors.As(err, &httpErr):
		result.UpstreamStatus = httpErr.StatusCode
		switch httpErr.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			result.Code, result.Error = "authentication_error", "The provider rejected the API key or its permissions."
		case http.StatusPaymentRequired:
			result.Code, result.Error = "quota_error", "The provider account has insufficient credit or quota."
		case http.StatusNotFound, http.StatusMethodNotAllowed:
			result.Code, result.Error = "endpoint_error", "The provider endpoint or model was not found. Check the Anthropic base URL and model ID."
		case http.StatusTooManyRequests:
			result.Code, result.Error = "rate_limit", "The provider is rate limited. Try again later."
		case http.StatusBadRequest, http.StatusUnprocessableEntity:
			result.Code, result.Error = "invalid_request", "The provider rejected the model or request. Check the model ID and Anthropic API compatibility."
		default:
			result.Code, result.Error = "provider_error", "The model provider returned an error. Try again later."
		}
	}
	return result
}
