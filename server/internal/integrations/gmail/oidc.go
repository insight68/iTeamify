package gmail

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const googleJWKSURL = "https://www.googleapis.com/oauth2/v3/certs"

type oidcClaims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	jwt.RegisteredClaims
}

type oidcVerifier struct {
	audience       string
	serviceAccount string
	http           *http.Client

	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	expiresAt time.Time
}

func newOIDCVerifier(audience, serviceAccount string, transport http.RoundTripper) *oidcVerifier {
	client := &http.Client{Timeout: 10 * time.Second}
	if transport != nil {
		client.Transport = transport
	}
	return &oidcVerifier{
		audience: audience, serviceAccount: serviceAccount, http: client,
		keys: make(map[string]*rsa.PublicKey),
	}
}

func (v *oidcVerifier) Verify(ctx context.Context, rawToken string) error {
	claims := &oidcClaims{}
	parsed, err := jwt.ParseWithClaims(rawToken, claims, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodRS256.Alg() {
			return nil, errors.New("gmail: unexpected push token algorithm")
		}
		kid, _ := token.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("gmail: push token missing kid")
		}
		return v.key(ctx, kid)
	}, jwt.WithAudience(v.audience), jwt.WithExpirationRequired(), jwt.WithLeeway(30*time.Second))
	if err != nil || !parsed.Valid {
		return errors.New("gmail: invalid push token")
	}
	issuer := strings.TrimRight(claims.Issuer, "/")
	if issuer != "https://accounts.google.com" && issuer != "accounts.google.com" {
		return errors.New("gmail: invalid push token issuer")
	}
	if v.serviceAccount != "" && (!claims.EmailVerified || !strings.EqualFold(claims.Email, v.serviceAccount)) {
		return errors.New("gmail: invalid push service account")
	}
	return nil
}

func (v *oidcVerifier) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.RLock()
	key := v.keys[kid]
	fresh := time.Now().Before(v.expiresAt)
	v.mu.RUnlock()
	if key != nil && fresh {
		return key, nil
	}
	if err := v.refresh(ctx); err != nil {
		return nil, err
	}
	v.mu.RLock()
	defer v.mu.RUnlock()
	key = v.keys[kid]
	if key == nil {
		return nil, errors.New("gmail: push signing key not found")
	}
	return key, nil
}

func (v *oidcVerifier) refresh(ctx context.Context) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	// Another request may have refreshed while this caller waited for the lock.
	if time.Now().Before(v.expiresAt) && len(v.keys) > 0 {
		return nil
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, googleJWKSURL, nil)
	if err != nil {
		return err
	}
	response, err := v.http.Do(request)
	if err != nil {
		return fmt.Errorf("gmail: load Google signing keys: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4<<10))
		return fmt.Errorf("gmail: Google signing keys returned status %d", response.StatusCode)
	}
	var payload struct {
		Keys []struct {
			Kty string `json:"kty"`
			Kid string `json:"kid"`
			Use string `json:"use"`
			Alg string `json:"alg"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&payload); err != nil {
		return fmt.Errorf("gmail: decode Google signing keys: %w", err)
	}
	keys := make(map[string]*rsa.PublicKey, len(payload.Keys))
	for _, item := range payload.Keys {
		if item.Kty != "RSA" || item.Alg != "RS256" || item.Kid == "" {
			continue
		}
		modulus, err := base64.RawURLEncoding.DecodeString(item.N)
		if err != nil {
			continue
		}
		exponentBytes, err := base64.RawURLEncoding.DecodeString(item.E)
		if err != nil || len(exponentBytes) == 0 || len(exponentBytes) > 4 {
			continue
		}
		exponent := 0
		for _, value := range exponentBytes {
			exponent = exponent<<8 | int(value)
		}
		if exponent < 3 {
			continue
		}
		keys[item.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(modulus), E: exponent}
	}
	if len(keys) == 0 {
		return errors.New("gmail: Google returned no usable signing keys")
	}
	v.keys = keys
	v.expiresAt = time.Now().Add(cacheMaxAge(response.Header.Get("Cache-Control")))
	return nil
}

func cacheMaxAge(value string) time.Duration {
	for _, directive := range strings.Split(value, ",") {
		name, raw, found := strings.Cut(strings.TrimSpace(directive), "=")
		if !found || !strings.EqualFold(name, "max-age") {
			continue
		}
		seconds, err := strconv.Atoi(strings.TrimSpace(raw))
		if err == nil && seconds > 0 {
			return time.Duration(seconds) * time.Second
		}
	}
	return time.Hour
}
