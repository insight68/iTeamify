package openagentendpoint

import (
	"context"
	"errors"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestProviderDialRejectsFakeIPWithDiagnostic(t *testing.T) {
	lookup := func(context.Context, string, string) ([]net.IP, error) {
		return []net.IP{net.ParseIP("198.18.4.9")}, nil
	}
	_, err := publicDialContext(&net.Dialer{}, lookup)(context.Background(), "tcp", "api.deepseek.com:443")
	if !errors.Is(err, ErrNonPublicAddress) {
		t.Fatalf("Fake-IP error=%v", err)
	}
}

func TestWorkspaceEndpointRejectsPrivateCredentialAndQueryTargets(t *testing.T) {
	for _, url := range []string{"http://public.example.com", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://192.168.1.1", "https://user:secret@example.com", "https://example.com?token=secret"} {
		if _, err := NormalizeBaseURL(url); err == nil {
			t.Fatalf("unsafe endpoint accepted: %s", url)
		}
	}
	if _, err := NormalizeBaseURL("https://provider.example.com/anthropic"); err != nil {
		t.Fatal(err)
	}
}
func TestWorkspaceEndpointTransportRejectsSpecialIPsAndRedirects(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "192.0.2.1", "::1"} {
		if openAgentPublicIP(net.ParseIP(ip)) {
			t.Fatal(ip)
		}
	}
	c := NewHTTPClient(time.Second)
	if c.CheckRedirect(&http.Request{}, nil) != http.ErrUseLastResponse {
		t.Fatal("provider redirect allowed")
	}
}
