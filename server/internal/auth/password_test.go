package auth

import (
	"context"
	"strings"
	"testing"
)

func TestPasswordHash(t *testing.T) {
	password := "  密码abcd  "
	one, err := HashPassword(context.Background(), password)
	if err != nil {
		t.Fatal(err)
	}
	two, err := HashPassword(context.Background(), password)
	if err != nil {
		t.Fatal(err)
	}
	if one == two {
		t.Fatal("salts must be unique")
	}
	if !CheckPassword(context.Background(), one, password) {
		t.Fatal("correct password rejected")
	}
	if CheckPassword(context.Background(), one, strings.TrimSpace(password)) {
		t.Fatal("password was trimmed")
	}
	if CheckPassword(context.Background(), one, "wrong-password-phrase") {
		t.Fatal("wrong password accepted")
	}
	if CheckPassword(context.Background(), "$argon2id$v=19$m=999999999,t=2,p=1$a$b", password) {
		t.Fatal("invalid costs accepted")
	}
}

func TestPasswordPolicy(t *testing.T) {
	for _, password := range []string{"short", "River1234", strings.Repeat("密", 9), "passwordpassword", strings.Repeat("x", 129)} {
		if ValidatePassword(password) == nil {
			t.Fatalf("accepted invalid password: %d characters", len(password))
		}
	}
	for _, password := range []string{"River12345", strings.Repeat("密", 10), strings.Repeat("x", 128)} {
		if err := ValidatePassword(password); err != nil {
			t.Fatal(err)
		}
	}
}
