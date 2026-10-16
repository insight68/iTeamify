// Package publicnet is the single source of truth for "may the platform dial
// this address". Two independent callers need the same answer:
//
//   - web retrieval fetches public-source pages;
//   - mcpprobe reaches a publisher-supplied third-party MCP endpoint.
//
// Both run on hosts that share a network with the control plane, so a target
// inside the private, loopback, link-local, or reserved space is never a
// legitimate destination — it is an authenticated pivot into the platform's own
// network. Keeping one implementation is what stops the two callers from
// drifting apart: a range approved in one place must be approved in the other.
package publicnet

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"time"
)

// ErrNonPublicAddress reports that a host resolved successfully, but only to
// addresses this package refuses to dial. Callers use it to separate a
// configuration mistake (never retry) from a transient network fault (retry).
var ErrNonPublicAddress = errors.New("host resolved only to non-public addresses")

// nonPublicPrefixes lists the ranges that are routable on the wire but must
// never be reached by the platform. The netip predicates in IsPublicAddr cover
// the common cases (private, loopback, link-local, multicast, unspecified);
// this table adds the reserved and documentation ranges plus the IPv6
// translation and unique-local space.
var nonPublicPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("10.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("127.0.0.0/8"),
	netip.MustParsePrefix("169.254.0.0/16"),
	netip.MustParsePrefix("172.16.0.0/12"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("192.88.99.0/24"),
	netip.MustParsePrefix("192.168.0.0/16"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("224.0.0.0/4"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("::/128"),
	netip.MustParsePrefix("::1/128"),
	netip.MustParsePrefix("64:ff9b:1::/48"),
	netip.MustParsePrefix("100::/64"),
	netip.MustParsePrefix("2001:db8::/32"),
	netip.MustParsePrefix("fc00::/7"),
	netip.MustParsePrefix("fe80::/10"),
	netip.MustParsePrefix("ff00::/8"),
}

// IsPublicIP reports whether ip is a globally routable unicast address outside
// every reserved range. IPv4-mapped IPv6 addresses are unmapped first, so
// ::ffff:127.0.0.1 is rejected like 127.0.0.1.
func IsPublicIP(ip net.IP) bool {
	address, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	return IsPublicAddr(address)
}

// IsPublicAddr is IsPublicIP for an already parsed address.
func IsPublicAddr(address netip.Addr) bool {
	address = address.Unmap()
	if !address.IsValid() || !address.IsGlobalUnicast() || address.IsPrivate() ||
		address.IsLoopback() || address.IsLinkLocalUnicast() {
		return false
	}
	for _, prefix := range nonPublicPrefixes {
		if prefix.Contains(address) {
			return false
		}
	}
	return true
}

// NewPublicOnlyDialer resolves the host itself and connects only to addresses
// IsPublicAddr approves. Resolving here rather than letting the transport
// resolve is the DNS-rebinding defence: the address that passes the check is
// the address that gets dialled, with no second lookup in between.
//
// The returned func matches http.Transport.DialContext.
func NewPublicOnlyDialer(timeout time.Duration) func(context.Context, string, string) (net.Conn, error) {
	dialer := &net.Dialer{Timeout: timeout, KeepAlive: 30 * time.Second}
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, fmt.Errorf("invalid target address")
		}
		addresses, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		if err != nil {
			return nil, fmt.Errorf("resolve target host: %w", err)
		}
		var lastErr error
		for _, resolved := range addresses {
			if !IsPublicAddr(resolved) {
				continue
			}
			connection, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(resolved.String(), port))
			if dialErr == nil {
				return connection, nil
			}
			lastErr = dialErr
		}
		if lastErr != nil {
			return nil, fmt.Errorf("connect approved target: %w", lastErr)
		}
		return nil, fmt.Errorf("%w: %s", ErrNonPublicAddress, host)
	}
}
