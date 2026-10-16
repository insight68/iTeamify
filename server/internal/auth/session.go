package auth

import (
	"context"
	"encoding/json"
	"errors"
	"math"

	"github.com/golang-jwt/jwt/v5"
	"github.com/iteamify-ai/iteamify/server/internal/util"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

var ErrSessionRevoked = errors.New("session revoked")

type SessionValidator func(context.Context, jwt.MapClaims) error

type SessionVersionReader interface {
	GetUserAuthVersion(context.Context, pgtype.UUID) (int64, error)
}

type sessionClaimsKey struct{}

func WithSessionClaims(ctx context.Context, claims jwt.MapClaims) context.Context {
	return context.WithValue(ctx, sessionClaimsKey{}, claims)
}

func SessionClaims(ctx context.Context) jwt.MapClaims {
	claims, _ := ctx.Value(sessionClaimsKey{}).(jwt.MapClaims)
	return claims
}

// SessionVersion accepts legacy JWTs only as version zero.
func SessionVersion(claims jwt.MapClaims) (int64, error) {
	raw, exists := claims["auth_version"]
	if !exists {
		return 0, nil
	}
	var version float64
	switch v := raw.(type) {
	case float64:
		version = v
	case json.Number:
		var err error
		version, err = v.Float64()
		if err != nil {
			return 0, ErrSessionRevoked
		}
	case int64:
		if v < 0 {
			return 0, ErrSessionRevoked
		}
		return v, nil
	default:
		return 0, ErrSessionRevoked
	}
	if version < 0 || version > 1<<53 || math.IsNaN(version) || math.IsInf(version, 0) || math.Trunc(version) != version {
		return 0, ErrSessionRevoked
	}
	return int64(version), nil
}

func ValidateSession(ctx context.Context, reader SessionVersionReader, claims jwt.MapClaims) error {
	sub, _ := claims["sub"].(string)
	uid, err := util.ParseUUID(sub)
	if err != nil {
		return ErrSessionRevoked
	}
	version, err := SessionVersion(claims)
	if err != nil {
		return err
	}
	current, err := reader.GetUserAuthVersion(ctx, uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrSessionRevoked
	}
	if err != nil {
		return err
	}
	if current != version {
		return ErrSessionRevoked
	}
	return nil
}
