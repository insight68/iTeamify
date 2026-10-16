package service

import (
	"context"
	"math"
	"math/big"

	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5/pgtype"
)

// TokenCreditMicro applies the one deployment-wide token rate to all four
// token counters. Billing rounds a task/model usage row up to 0.001 credit;
// big.Int keeps a large cumulative token report from overflowing int64 during
// the multiply before the bounded quotient is checked.
func TokenCreditMicro(totalTokens, rateMicroPerMillion int64) (int64, bool) {
	if totalTokens < 0 || rateMicroPerMillion <= 0 {
		return 0, false
	}
	product := new(big.Int).Mul(big.NewInt(totalTokens), big.NewInt(rateMicroPerMillion))
	// ceil(product / 1e9) * 1000 == ceil(raw microcredits / 1000) * 1000.
	units := new(big.Int).Add(product, big.NewInt(1_000_000_000-1))
	units.Quo(units, big.NewInt(1_000_000_000))
	units.Mul(units, big.NewInt(1_000))
	if !units.IsInt64() {
		return 0, false
	}
	return units.Int64(), true
}

// UsageCharge is an already validated cumulative-usage delta.
type UsageCharge struct {
	Key         string
	Amount      int64
	ReferenceID string
	Description string
}

// DebitUsageLocked shares the caller's transaction. The caller must lock the
// workspace account before any source rows, and commit its usage watermark
// together with this debit. No external calls or historical ledger scans occur.
func DebitUsageLocked(ctx context.Context, q *db.Queries, ws pgtype.UUID, balance int64, charges []UsageCharge) error {
	var total int64
	for _, charge := range charges {
		if charge.Amount <= 0 || charge.Key == "" || charge.Amount > math.MaxInt64-total {
			return ErrInvalidBillingInput
		}
		total += charge.Amount
	}
	if total == 0 {
		return nil
	}
	if balance < math.MinInt64+total {
		return ErrInvalidBillingInput
	}
	if _, err := q.AddCreditBalance(ctx, db.AddCreditBalanceParams{WorkspaceID: ws, AmountMicro: -total}); err != nil {
		return err
	}
	for _, charge := range charges {
		balance -= charge.Amount
		if _, err := q.InsertCreditLedger(ctx, db.InsertCreditLedgerParams{WorkspaceID: ws, BusinessKey: charge.Key, Kind: "usage", AmountMicro: -charge.Amount, BalanceAfter: balance, ReferenceID: charge.ReferenceID, Description: charge.Description}); err != nil {
			return err
		}
	}
	return nil
}

func RequireCreditBalance(balance, negativeLimit int64) error {
	if balance <= negativeLimit {
		return ErrInsufficientCredits
	}
	return nil
}

// Admission does not reserve or debit credits. Concurrent starts intentionally
// share the ordinary task billing semantics; running work may exceed the limit.
func CheckWorkspaceCredits(ctx context.Context, q *db.Queries, ws pgtype.UUID) error {
	account, err := q.GetCreditAccount(ctx, ws)
	if err != nil {
		return err
	}
	settings, err := q.GetBillingSettings(ctx)
	if err != nil {
		return err
	}
	return RequireCreditBalance(account.BalanceMicro, settings.NegativeLimitMicro)
}
