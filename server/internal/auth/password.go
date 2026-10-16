package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"sync"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

const passwordMemory = 19 * 1024

var passwordSlots = make(chan struct{}, 4)
var dummyPasswordOnce sync.Once
var dummyPasswordHash string

var ErrPasswordPolicy = errors.New("password must be 10–128 characters and must not be a common password")

// ValidatePassword deliberately preserves whitespace and Unicode characters.
func ValidatePassword(password string) error {
	n := utf8.RuneCountInString(password)
	if !utf8.ValidString(password) || n < 10 || n > 128 {
		return ErrPasswordPolicy
	}
	weak := map[string]bool{
		"123456789012345": true, "1234567890123456": true,
		"passwordpassword": true, "password123456789": true,
		"qwertyuiopasdfgh": true, "aaaaaaaaaaaaaaa": true,
		"letmeinletmeinletmein": true, "iloveyouiloveyou": true,
	}
	if weak[strings.ToLower(password)] {
		return ErrPasswordPolicy
	}
	return nil
}

func passwordSlot(ctx context.Context) (func(), error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	select {
	case passwordSlots <- struct{}{}:
		return func() { <-passwordSlots }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func HashPassword(ctx context.Context, password string) (string, error) {
	if err := ValidatePassword(password); err != nil {
		return "", err
	}
	release, err := passwordSlot(ctx)
	if err != nil {
		return "", err
	}
	defer release()
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(password), salt, 2, passwordMemory, 1, 32)
	return fmt.Sprintf("$argon2id$v=19$m=19456,t=2,p=1$%s$%s",
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

func CheckPassword(ctx context.Context, encoded, password string) bool {
	if !utf8.ValidString(password) || utf8.RuneCountInString(password) > 128 {
		return false
	}
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" || parts[3] != "m=19456,t=2,p=1" {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) != 16 {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) != 32 {
		return false
	}
	release, err := passwordSlot(ctx)
	if err != nil {
		return false
	}
	defer release()
	key := argon2.IDKey([]byte(password), salt, 2, passwordMemory, 1, 32)
	return subtle.ConstantTimeCompare(want, key) == 1
}

// DummyPasswordHash makes unknown-account login do the same expensive work.
func DummyPasswordHash() string {
	dummyPasswordOnce.Do(func() {
		dummyPasswordHash, _ = HashPassword(context.Background(), "dummy-password-for-authentication")
	})
	return dummyPasswordHash
}
