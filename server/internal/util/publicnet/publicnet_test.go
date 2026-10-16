package publicnet

import (
	"context"
	"errors"
	"net"
	"testing"
)

func parseIP(t *testing.T, value string) net.IP {
	t.Helper()
	ip := net.ParseIP(value)
	if ip == nil {
		t.Fatalf("parse IP %q", value)
	}
	return ip
}

func TestIsPublicIPRejectsInternalRanges(t *testing.T) {
	for _, value := range []string{
		"127.0.0.1", "10.0.0.1", "100.64.0.1", "172.16.0.1", "192.168.1.1",
		"169.254.169.254", "192.0.2.1", "198.18.0.1", "203.0.113.10",
		"0.0.0.0", "224.0.0.1", "240.0.0.1", "255.255.255.255",
		"::", "::1", "fe80::1", "fc00::1", "2001:db8::1", "ff02::1",
		"::ffff:127.0.0.1", "::ffff:10.0.0.1",
	} {
		if IsPublicIP(parseIP(t, value)) {
			t.Fatalf("internal address %s was allowed", value)
		}
	}
	if !IsPublicIP(parseIP(t, "8.8.8.8")) || !IsPublicIP(parseIP(t, "2606:4700:4700::1111")) {
		t.Fatal("public internet address was rejected")
	}
	if IsPublicIP(nil) || IsPublicIP(net.IP{1, 2, 3}) {
		t.Fatal("malformed address was allowed")
	}
}

// The dialer is the DNS-rebinding defence: the address that passes the check is
// the one that gets dialled. A host that resolves only to internal space must
// report ErrNonPublicAddress so callers can classify it as a configuration
// error instead of retrying forever.
func TestPublicOnlyDialerRefusesLoopbackTargets(t *testing.T) {
	dial := NewPublicOnlyDialer(0)
	_, err := dial(context.Background(), "tcp", "127.0.0.1:443")
	if err == nil {
		t.Fatal("loopback target was dialled")
	}
	if !errors.Is(err, ErrNonPublicAddress) {
		t.Fatalf("loopback error = %v, want ErrNonPublicAddress", err)
	}
}

func TestPublicOnlyDialerRejectsMalformedAddress(t *testing.T) {
	dial := NewPublicOnlyDialer(0)
	if _, err := dial(context.Background(), "tcp", "no-port"); err == nil {
		t.Fatal("malformed address was accepted")
	}
}
