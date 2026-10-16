package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/iteamify-ai/iteamify/server/internal/util"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	stripe "github.com/stripe/stripe-go/v84"
)

func TestBillingMoneyValidation(t *testing.T) {
	if n, err := CreditsForTopup(500, 1_000_000_000); err != nil || n != 5_000_000_000 {
		t.Fatalf("%d %v", n, err)
	}
	for _, tc := range [][2]int64{{-1, 100}, {49, 100}, {100, 0}, {200, math.MaxInt64}, {99, 1}, {100000000, 100}} {
		if _, err := CreditsForTopup(tc[0], tc[1]); err == nil {
			t.Fatalf("accepted %v", tc)
		}
	}
}
func TestBillingStripeConfig(t *testing.T) {
	if err := ValidateStripeConfig("", "", ""); err != nil {
		t.Fatal(err)
	}
	for _, tc := range [][3]string{{"sk_test_x", "", "http://localhost:3000"}, {"sk_live_x", "whsec_x", "http://example.com"}, {"sk_test_x", "whsec_x", "https://example.com?next=evil"}} {
		if err := ValidateStripeConfig(tc[0], tc[1], tc[2]); err == nil {
			t.Fatal("invalid config accepted")
		}
	}
	if err := ValidateStripeConfig("sk_live_x", "whsec_x", "https://example.com"); err != nil {
		t.Fatal(err)
	}
}

// Opt-in integration tests use a disposable, fully migrated database only.
func TestLocalBillingConcurrentFulfillment(t *testing.T) {
	raw := os.Getenv("BILLING_TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("set BILLING_TEST_DATABASE_URL to an isolated migrated database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, raw)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	q := db.New(pool)
	ws, _ := util.ParseUUID(uuid.NewString())
	actor, _ := util.ParseUUID(uuid.NewString())
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), "DELETE FROM workspace_credit_ledger WHERE workspace_id=$1", ws)
		_, _ = pool.Exec(context.Background(), "DELETE FROM workspace_topup_order WHERE workspace_id=$1", ws)
		_, _ = pool.Exec(context.Background(), "DELETE FROM workspace_credit_account WHERE workspace_id=$1", ws)
	})
	if err = q.EnsureCreditAccount(ctx, ws); err != nil {
		t.Fatal(err)
	}
	order, err := q.CreateTopupOrder(ctx, db.CreateTopupOrderParams{WorkspaceID: ws, PayerUserID: actor, RequestKey: uuid.NewString(), AmountCents: 500, CreditsMicro: 5_000_000_000, CreditsMicroPerUsd: 1_000_000_000, ReturnUrl: "https://example.com/demo/billing"})
	if err != nil {
		t.Fatal(err)
	}
	b := NewBilling(q, pool, "", "", "")
	session := &stripe.CheckoutSession{ID: "cs_test_" + uuid.NewString(), Mode: "payment", Currency: "usd", AmountTotal: 500, PaymentStatus: "paid", ClientReferenceID: util.UUIDToString(order.ID), Metadata: map[string]string{"workspace_id": util.UUIDToString(ws), "order_id": util.UUIDToString(order.ID)}, PaymentIntent: &stripe.PaymentIntent{ID: "pi_" + uuid.NewString()}}
	requests := 0
	stripeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost {
			_ = r.ParseForm()
			if r.Header.Get("Idempotency-Key") != "workspace_topup:"+util.UUIDToString(order.ID) || r.Form.Get("line_items[0][price_data][unit_amount]") != "500" || r.Form.Get("metadata[workspace_id]") != util.UUIDToString(ws) {
				t.Error("checkout did not use persisted order identity and amount")
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"id": session.ID, "url": "https://checkout.stripe.com/c/pay/test"})
			return
		}
		_ = json.NewEncoder(w).Encode(session)
	}))
	defer stripeServer.Close()
	b.Stripe = stripe.NewClient("sk_test_fixture", stripe.WithBackends(stripe.NewBackendsWithConfig(&stripe.BackendConfig{URL: stripe.String(stripeServer.URL), MaxNetworkRetries: stripe.Int64(0)})))
	for i := 0; i < 2; i++ {
		if _, err = b.Checkout(ctx, ws, actor, order.RequestKey, 500); err != nil {
			t.Fatal(err)
		}
	}
	if requests != 1 {
		t.Fatalf("checkout replay made %d remote calls", requests)
	}
	if _, err = b.Checkout(ctx, ws, actor, order.RequestKey, 1000); !errors.Is(err, ErrBillingConflict) {
		t.Fatal("checkout replay changed amount")
	}
	// Recover a session whose response was lost before local attachment.
	if _, err = pool.Exec(ctx, "UPDATE workspace_topup_order SET stripe_checkout_id='',checkout_url='' WHERE id=$1", order.ID); err != nil {
		t.Fatal(err)
	}
	if err = b.Fulfill(ctx, session, "evt_recovery"); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 100)
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) { defer wg.Done(); errs <- b.Fulfill(ctx, session, fmt.Sprintf("evt_%d", i)) }(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	account, err := q.GetCreditAccount(ctx, ws)
	if err != nil || account.BalanceMicro != order.CreditsMicro {
		t.Fatalf("account %+v error %v", account, err)
	}
	var count int
	var total int64
	if err = pool.QueryRow(ctx, "SELECT count(*),sum(amount_micro) FROM workspace_credit_ledger WHERE workspace_id=$1", ws).Scan(&count, &total); err != nil || count != 1 || total != account.BalanceMicro {
		t.Fatalf("ledger count %d total %d err %v", count, total, err)
	}
	bad := *session
	bad.AmountTotal = 501
	if !errors.Is(b.Fulfill(ctx, &bad, "evt_bad"), ErrBillingConflict) {
		t.Fatal("mismatched amount accepted")
	}
	bad = *session
	bad.PaymentIntent = &stripe.PaymentIntent{ID: "pi_other"}
	if !errors.Is(b.Fulfill(ctx, &bad, "evt_bad"), ErrBillingConflict) {
		t.Fatal("different payment accepted")
	}
	other, _ := util.ParseUUID(uuid.NewString())
	if _, err = q.GetTopupOrder(ctx, db.GetTopupOrderParams{WorkspaceID: other, ID: order.ID}); err == nil {
		t.Fatal("cross-workspace read allowed")
	}
	// Failure after the balance update must roll back both facts.
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	qt := q.WithTx(tx)
	if _, err = qt.LockCreditAccount(ctx, ws); err != nil {
		t.Fatal(err)
	}
	if err = CreditLocked(ctx, qt, ws, "rollback-example", "invalid_kind", 123, "", pgtype.UUID{}, ""); err == nil {
		t.Fatal("expected ledger constraint failure")
	}
	_ = tx.Rollback(ctx)
	after, _ := q.GetCreditAccount(ctx, ws)
	if after.BalanceMicro != account.BalanceMicro {
		t.Fatal("failed ledger write changed balance")
	}
}
