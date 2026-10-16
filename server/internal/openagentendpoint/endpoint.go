// Package openagentendpoint restricts workspace-owned model connections to public HTTPS.
package openagentendpoint

import (
	"context"
	"crypto/tls"
	"errors"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

var openAgentNonPublicPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("64:ff9b:1::/48"),
	netip.MustParsePrefix("100::/64"),
	netip.MustParsePrefix("2001:db8::/32"),
}

var (
	ErrDNSResolution    = errors.New("provider hostname could not be resolved")
	ErrNonPublicAddress = errors.New("provider hostname resolves to non-public addresses")
	ErrConnectionFailed = errors.New("provider public addresses could not be reached")
)

func NormalizeBaseURL(raw string) (string, error) {
	value := strings.TrimRight(strings.TrimSpace(raw), "/")
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return "", errors.New("base_url must be an absolute HTTPS URL")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("base_url must not contain credentials, query parameters, or a fragment")
	}
	host := strings.TrimSuffix(strings.ToLower(parsed.Hostname()), ".")
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return "", errors.New("base_url must point to a public HTTPS endpoint")
	}
	if ip := net.ParseIP(host); ip != nil && !openAgentPublicIP(ip) {
		return "", errors.New("base_url must point to a public HTTPS endpoint")
	}
	return value, nil
}

func NewHTTPClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{
		Proxy:               nil,
		DialContext:         publicDialContext(dialer, net.DefaultResolver.LookupIP),
		ForceAttemptHTTP2:   true,
		IdleConnTimeout:     90 * time.Second,
		MaxIdleConns:        16,
		TLSHandshakeTimeout: 10 * time.Second,
		TLSClientConfig:     &tls.Config{MinVersion: tls.VersionTLS12},
	}
	return &http.Client{
		Transport: transport,
		Timeout:   timeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func publicDialContext(dialer *net.Dialer, lookup func(context.Context, string, string) ([]net.IP, error)) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, errors.New("invalid provider address")
		}
		addresses, err := lookup(ctx, "ip", host)
		if err != nil {
			return nil, errors.Join(ErrDNSResolution, err)
		}
		publicCount := 0
		var lastErr error
		for _, candidate := range addresses {
			if !openAgentPublicIP(candidate) {
				continue
			}
			publicCount++
			connection, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(candidate.String(), port))
			if dialErr == nil {
				return connection, nil
			}
			lastErr = dialErr
		}
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if publicCount == 0 {
			return nil, ErrNonPublicAddress
		}
		return nil, errors.Join(ErrConnectionFailed, lastErr)
	}
}

func openAgentPublicIP(ip net.IP) bool {
	if ip == nil || !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
		return false
	}
	address, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	address = address.Unmap()
	for _, prefix := range openAgentNonPublicPrefixes {
		if prefix.Contains(address) {
			return false
		}
	}
	return true
}
