package realtime

import (
	"context"
	"errors"
	"net"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/iteamify-ai/iteamify/server/internal/auth"
)

func TestWebSocketRevalidatesSessionOnOtherNode(t *testing.T) {
	for _, outgoing := range []bool{false, true} {
		t.Run(map[bool]string{false: "idle", true: "outgoing"}[outgoing], func(t *testing.T) {
			hub, server := newTestHub(t)
			defer server.Close()
			var revoked atomic.Bool
			hub.SetSessionValidator(func(context.Context, jwt.MapClaims) error {
				if revoked.Load() {
					return auth.ErrSessionRevoked
				}
				return nil
			})
			conn := connectWS(t, server)
			defer conn.Close()
			revoked.Store(true)
			if outgoing {
				hub.Broadcast([]byte(`{"type":"private-data"}`))
			}
			conn.SetReadDeadline(time.Now().Add(3 * time.Second))
			_, data, err := conn.ReadMessage()
			if err == nil {
				t.Fatalf("revoked socket received %s", data)
			}
			var netErr net.Error
			if errors.As(err, &netErr) && netErr.Timeout() {
				t.Fatal("revoked idle socket was not closed")
			}
		})
	}
}

func TestRevokeUserSessionsPreservesPATAndCurrentJWT(t *testing.T) {
	hub := NewHub()
	old := &Client{hub: hub, userID: "u", sessionToken: "jwt", sessionVersion: 1, send: make(chan []byte, 1)}
	current := &Client{hub: hub, userID: "u", sessionToken: "jwt", sessionVersion: 2, send: make(chan []byte, 1)}
	pat := &Client{hub: hub, userID: "u", send: make(chan []byte, 1)}
	other := &Client{hub: hub, userID: "other", sessionToken: "jwt", send: make(chan []byte, 1)}
	for _, c := range []*Client{old, current, pat, other} {
		hub.clients[c] = true
	}
	hub.RevokeUserSessions("u", 2)
	if hub.clients[old] || !hub.clients[current] || !hub.clients[pat] || !hub.clients[other] {
		t.Fatal("incorrect revocation scope")
	}
}

func TestWebSocketSessionLookupFailuresRemainRetryable(t *testing.T) {
	token := makeTestToken(t)
	_, message := authenticateToken(token, nil, context.Background(), func(context.Context, jwt.MapClaims) error { return errors.New("database unavailable") })
	if !strings.Contains(message, `"retryable":true`) {
		t.Fatalf("database outage is not retryable: %s", message)
	}
	_, message = authenticateToken(token, nil, context.Background(), func(context.Context, jwt.MapClaims) error { return auth.ErrSessionRevoked })
	if strings.Contains(message, `"retryable":true`) {
		t.Fatal("revocation treated as temporary outage")
	}
}
