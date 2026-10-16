package middleware

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// rateLimitScript atomically increments the counter and sets the TTL on
// first access. Using a Lua script ensures INCR and EXPIRE cannot be
// split by a network failure — if INCR succeeds the TTL is guaranteed
// to be set, preventing a stuck key that acts as a permanent ban.
var rateLimitScript = redis.NewScript(`
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`)

// ParseTrustedProxies parses a comma-separated list of CIDRs into a
// slice of *net.IPNet. Invalid entries are warned and skipped.
// Returns nil if raw is empty (default: never trust X-Forwarded-For).
func ParseTrustedProxies(raw string) []*net.IPNet {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	var nets []*net.IPNet
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		_, cidr, err := net.ParseCIDR(p)
		if err != nil {
			slog.Warn("ratelimit: invalid trusted proxy CIDR, skipping", "cidr", p, "error", err)
			continue
		}
		nets = append(nets, cidr)
	}
	return nets
}

// RateLimit returns a per-IP fixed-window rate limiter backed by Redis.
// If rdb is nil the middleware is a no-op (fail-open).
//
// trustedProxies controls X-Forwarded-For handling: when the direct
// connection (RemoteAddr) originates from a CIDR in the list, the
// rightmost non-trusted IP in the XFF chain is used as the client IP.
// When the list is empty (default), XFF is never consulted — only
// RemoteAddr is used. This matches the project's conservative trust
// model (see health_realtime.go).
func RateLimit(rdb *redis.Client, limit int, window time.Duration, trustedProxies []*net.IPNet) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if rdb == nil {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := extractIP(r, trustedProxies)
			key := rateLimitKey(r.URL.Path, ip)
			ctx := r.Context()

			count, err := rateLimitScript.Run(ctx, rdb, []string{key}, int(window.Seconds())).Int64()
			if err != nil {
				slog.Warn("ratelimit: redis error; allowing request", "error", err, "ip", ip)
				next.ServeHTTP(w, r)
				return
			}
			if count > int64(limit) {
				w.Header().Set("Retry-After", fmt.Sprintf("%d", int(window.Seconds())))
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]string{"error": "too many requests"})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

type localFixedWindowEntry struct {
	count     int64
	expiresAt time.Time
}

type localFixedWindow struct {
	mu      sync.Mutex
	entries map[string]localFixedWindowEntry
}

func (l *localFixedWindow) increment(key string, window time.Duration, now time.Time) int64 {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.entries == nil {
		l.entries = make(map[string]localFixedWindowEntry)
	}
	entry := l.entries[key]
	if !entry.expiresAt.After(now) {
		entry = localFixedWindowEntry{expiresAt: now.Add(window)}
	}
	entry.count++
	l.entries[key] = entry
	if len(l.entries) > 10_000 {
		for candidate, value := range l.entries {
			if !value.expiresAt.After(now) {
				delete(l.entries, candidate)
			}
		}
	}
	return entry.count
}

// RateLimitClass applies a stable per-IP bucket that does not include dynamic
// URL identifiers. It retains an in-process fixed-window ceiling when Redis is
// absent or unavailable, which makes it appropriate for anonymous OTP/SSE
// routes where fail-open would permit trivial bucket rotation or outages to
// disable protection entirely.
func RateLimitClass(rdb *redis.Client, class string, limit int, window time.Duration, trustedProxies []*net.IPNet) func(http.Handler) http.Handler {
	local := &localFixedWindow{}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := extractIP(r, trustedProxies)
			key := class + ":" + ip

			if rdb != nil {
				count, err := rateLimitScript.Run(r.Context(), rdb, []string{key}, int(window.Seconds())).Int64()
				if err == nil {
					if count > int64(limit) {
						writeTooManyRequests(w, window)
						return
					}
					next.ServeHTTP(w, r)
					return
				}
				slog.Warn("ratelimit: redis error; falling back to in-process ceiling", "class", class, "error", err, "ip", ip)
			}

			// Redis is absent or failing. Keep a per-process ceiling so an
			// outage cannot disable protection entirely.
			if local.increment(key, window, time.Now()) > int64(limit) {
				writeTooManyRequests(w, window)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RateLimitClassStrict applies the same stable per-IP bucket as
// RateLimitClass, but fails closed when Redis is absent or its counter cannot
// be updated. It is intended for anonymous public endpoints that can allocate
// model budget, collect PII, create verification challenges, or confirm a
// transaction. A per-process fallback is not a safe substitute on a
// multi-node deployment because every API replica would grant an independent
// allowance.
func RateLimitClassStrict(rdb *redis.Client, class string, limit int, window time.Duration, trustedProxies []*net.IPNet) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if rdb == nil {
				slog.Error("ratelimit: redis unavailable; refusing request (strict class)", "class", class)
				writeRateLimitUnavailable(w, window)
				return
			}
			ip := extractIP(r, trustedProxies)
			key := class + ":" + ip

			count, err := rateLimitScript.Run(r.Context(), rdb, []string{key}, int(window.Seconds())).Int64()
			if err != nil {
				slog.Error("ratelimit: redis error; refusing request (strict class)", "class", class, "error", err, "ip", ip)
				writeRateLimitUnavailable(w, window)
				return
			}
			if count > int64(limit) {
				writeTooManyRequests(w, window)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// writeTooManyRequests answers with the shared 429 body. Retry-After is clamped
// by the caller's window so a long window still yields an actionable hint.
func writeTooManyRequests(w http.ResponseWriter, window time.Duration) {
	retryAfter := int(window.Seconds())
	if retryAfter < 1 || retryAfter > 60 {
		retryAfter = 30
	}
	w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "too many requests"})
}

func writeRateLimitUnavailable(w http.ResponseWriter, window time.Duration) {
	retryAfter := int(window.Seconds())
	if retryAfter < 1 || retryAfter > 60 {
		retryAfter = 30
	}
	w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusServiceUnavailable)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": "public request protection is temporarily unavailable",
		"code":  "rate_limit_unavailable",
	})
}

// ConcurrentLimitIP caps long-lived requests such as SSE streams per client
// IP on each API node. It complements (rather than replaces) the stable
// start-rate bucket above and always works without Redis.
func ConcurrentLimitIP(limit int, trustedProxies []*net.IPNet) func(http.Handler) http.Handler {
	var mu sync.Mutex
	active := make(map[string]int)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := extractIP(r, trustedProxies)
			mu.Lock()
			if active[ip] >= limit {
				mu.Unlock()
				w.Header().Set("Retry-After", "15")
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "too many concurrent requests"})
				return
			}
			active[ip]++
			mu.Unlock()
			defer func() {
				mu.Lock()
				active[ip]--
				if active[ip] <= 0 {
					delete(active, ip)
				}
				mu.Unlock()
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// extractIP determines the client IP for rate limiting purposes.
// It only honors X-Forwarded-For when RemoteAddr is from a trusted proxy.
func extractIP(r *http.Request, trustedProxies []*net.IPNet) string {
	remoteHost, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remoteHost = r.RemoteAddr
	}

	if len(trustedProxies) > 0 {
		remoteIP := net.ParseIP(remoteHost)
		if remoteIP != nil && isTrustedProxy(remoteIP, trustedProxies) {
			if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
				// Walk right-to-left: the rightmost non-trusted entry is
				// the last hop before the trusted proxy chain.
				parts := strings.Split(xff, ",")
				for i := len(parts) - 1; i >= 0; i-- {
					candidate := net.ParseIP(strings.TrimSpace(parts[i]))
					if candidate != nil && !isTrustedProxy(candidate, trustedProxies) {
						return candidate.String()
					}
				}
			}
		}
	}

	// Default: use RemoteAddr in canonical form.
	if ip := net.ParseIP(remoteHost); ip != nil {
		return ip.String()
	}
	return remoteHost
}

func isTrustedProxy(ip net.IP, cidrs []*net.IPNet) bool {
	for _, cidr := range cidrs {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

func rateLimitKey(path, ip string) string {
	sanitized := strings.TrimPrefix(path, "/")
	sanitized = strings.ReplaceAll(sanitized, "/", ":")
	return fmt.Sprintf("mul:ratelimit:%s:%s", sanitized, ip)
}
