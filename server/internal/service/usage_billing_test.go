package service

import "testing"

func TestTokenCreditMicroUsesOneRateForAllTokens(t *testing.T) {
	t.Parallel()

	// 1,234 tokens at 1,000 credits / million = 1.234 credits.
	got, ok := TokenCreditMicro(1_234, 1_000*MicroPerCredit)
	if !ok {
		t.Fatal("TokenCreditMicro rejected valid usage")
	}
	if want := int64(1_234_000); got != want {
		t.Fatalf("credit micro = %d, want %d", got, want)
	}
}

func TestTokenCreditMicroRoundsUpToOneThousandMicrocredits(t *testing.T) {
	t.Parallel()

	got, ok := TokenCreditMicro(1, MicroPerCredit)
	if !ok {
		t.Fatal("TokenCreditMicro rejected valid usage")
	}
	if want := int64(1_000); got != want {
		t.Fatalf("credit micro = %d, want %d", got, want)
	}
}

func TestTokenCreditMicroRejectsInvalidRate(t *testing.T) {
	t.Parallel()
	if _, ok := TokenCreditMicro(1, 0); ok {
		t.Fatal("TokenCreditMicro accepted zero rate")
	}
}
