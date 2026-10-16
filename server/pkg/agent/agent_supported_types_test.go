package agent

import (
	"log/slog"
	"testing"
)

// TestSupportedTypesLockstepWithNew guards the backend-family whitelist: every
// type must be constructable by New, and New must reject anything outside it.
// SupportsCustomCommand applies the narrower executable-profile policy.
func TestSupportedTypesLockstepWithNew(t *testing.T) {
	cfg := Config{Logger: slog.Default()}

	for _, typ := range SupportedTypes {
		if !IsSupportedType(typ) {
			t.Errorf("IsSupportedType(%q) = false, but it is in SupportedTypes", typ)
		}
		if _, err := New(typ, cfg); err != nil {
			t.Errorf("New(%q) returned error for a SupportedTypes entry: %v", typ, err)
		}
	}

	// A type outside the whitelist must be rejected by both.
	const bogus = "definitely-not-a-real-backend"
	if IsSupportedType(bogus) {
		t.Errorf("IsSupportedType(%q) = true, want false", bogus)
	}
	if _, err := New(bogus, cfg); err == nil {
		t.Errorf("New(%q) succeeded, want error for an unsupported type", bogus)
	}
}

func TestEmbeddedOpenAgentIsNotACustomCommandProtocol(t *testing.T) {
	if SupportsCustomCommand("openagent") {
		t.Fatal("embedded OpenAgent was accepted as a custom command runtime")
	}
	if !SupportsCustomCommand("claude") {
		t.Fatal("CLI-backed Claude was rejected as a custom command runtime")
	}
}
