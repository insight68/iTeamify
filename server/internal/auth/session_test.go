package auth

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"testing"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type testVersionReader struct {
	version int64
	err     error
}

func (r testVersionReader) GetUserAuthVersion(context.Context, pgtype.UUID) (int64, error) {
	return r.version, r.err
}

func TestSessionVersionBoundary(t *testing.T) {
	for _, value := range []any{-1.0, 0.5, math.NaN(), math.Inf(1), "1", nil, json.Number("bad")} {
		if _, err := SessionVersion(jwt.MapClaims{"auth_version": value}); !errors.Is(err, ErrSessionRevoked) {
			t.Fatalf("accepted invalid version %v", value)
		}
	}
	for _, value := range []any{float64(1), int64(1), json.Number("1")} {
		if version, err := SessionVersion(jwt.MapClaims{"auth_version": value}); err != nil || version != 1 {
			t.Fatalf("version %v: %d %v", value, version, err)
		}
	}
}

func TestValidateSessionLegacyAndFailures(t *testing.T) {
	claims := jwt.MapClaims{"sub": "00000000-0000-4000-8000-000000000001"}
	if err := ValidateSession(context.Background(), testVersionReader{}, claims); err != nil {
		t.Fatal(err)
	}
	if err := ValidateSession(context.Background(), testVersionReader{version: 1}, claims); !errors.Is(err, ErrSessionRevoked) {
		t.Fatal("legacy JWT survived credential change")
	}
	claims["auth_version"] = float64(2)
	if err := ValidateSession(context.Background(), testVersionReader{version: 2}, claims); err != nil {
		t.Fatal(err)
	}
	if err := ValidateSession(context.Background(), testVersionReader{err: pgx.ErrNoRows}, claims); !errors.Is(err, ErrSessionRevoked) {
		t.Fatal("deleted user session survived")
	}
	unavailable := errors.New("database unavailable")
	if err := ValidateSession(context.Background(), testVersionReader{err: unavailable}, claims); !errors.Is(err, unavailable) {
		t.Fatal("database error was treated as credential failure")
	}
	claims["sub"] = "invalid"
	if err := ValidateSession(context.Background(), testVersionReader{}, claims); !errors.Is(err, ErrSessionRevoked) {
		t.Fatal("invalid UUID accepted")
	}
}
