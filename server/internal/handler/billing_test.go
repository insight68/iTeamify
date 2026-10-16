package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	obsmetrics "github.com/iteamify-ai/iteamify/server/internal/metrics"
	"github.com/iteamify-ai/iteamify/server/internal/service"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	stripe "github.com/stripe/stripe-go/v84"
	"github.com/stripe/stripe-go/v84/webhook"
)

func TestLocalBillingTaskAdmissionAndHistoricalCutover(t *testing.T) {
	if testHandler == nil {
		t.Skip("database unavailable")
	}
	ctx := context.Background()
	var agentID string
	if err := testPool.QueryRow(ctx, `SELECT id FROM agent WHERE workspace_id=$1 LIMIT 1`, testWorkspaceID).Scan(&agentID); err != nil {
		t.Fatal(err)
	}
	newTask := func(status string) string {
		var id string
		if err := testPool.QueryRow(ctx, `INSERT INTO agent_task_queue(agent_id,runtime_id,status,context) VALUES($1,$2,$3,jsonb_build_object('type','quick_create','workspace_id',$4::text,'prompt','billing test')) RETURNING id`, agentID, testRuntimeID, status, testWorkspaceID).Scan(&id); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			_, _ = testPool.Exec(context.Background(), "DELETE FROM task_usage WHERE task_id=$1", id)
			_, _ = testPool.Exec(context.Background(), "DELETE FROM task_token_credit_rate_snapshot WHERE task_id=$1", id)
			_, _ = testPool.Exec(context.Background(), "DELETE FROM agent_task_queue WHERE id=$1", id)
		})
		return id
	}
	historical := newTask("running")
	r := newDaemonTokenRequest(http.MethodPost, "/usage", map[string]any{"usage": []map[string]any{{"provider": "claude", "model": "historical", "input_tokens": 1000}}}, testWorkspaceID, "test")
	w := httptest.NewRecorder()
	testHandler.ReportTaskUsage(w, withURLParam(r, "taskId", historical))
	if w.Code != 200 {
		t.Fatal(w.Body)
	}
	var count int
	if err := testPool.QueryRow(ctx, `SELECT count(*) FROM workspace_credit_ledger WHERE reference_id=$1`, historical).Scan(&count); err != nil || count != 0 {
		t.Fatal("historical task was charged", err)
	}
	startedID := newTask("dispatched")
	if _, err := testHandler.TaskService.StartTask(ctx, parseUUID(startedID)); err != nil {
		t.Fatal(err)
	}
	state, err := testHandler.Queries.LockTaskBilling(ctx, parseUUID(startedID))
	if err != nil || !state.LocalBillingEnabled || state.Status != "running" {
		t.Fatalf("start state %+v %v", state, err)
	}
	var snapshot int
	if err := testPool.QueryRow(ctx, `SELECT count(*) FROM task_token_credit_rate_snapshot WHERE task_id=$1`, startedID).Scan(&snapshot); err != nil || snapshot != 1 {
		t.Fatal("missing task-start rate snapshot", err)
	}
	account, err := testHandler.Queries.GetCreditAccount(ctx, parseUUID(testWorkspaceID))
	if err != nil {
		t.Fatal(err)
	}
	settings, err := testHandler.Queries.GetBillingSettings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	delta := settings.NegativeLimitMicro - account.BalanceMicro
	if delta != 0 {
		if _, err := testPool.Exec(ctx, `UPDATE workspace_credit_account SET balance_micro=$2 WHERE workspace_id=$1`, testWorkspaceID, settings.NegativeLimitMicro); err != nil {
			t.Fatal(err)
		}
		defer testPool.Exec(ctx, `UPDATE workspace_credit_account SET balance_micro=$2 WHERE workspace_id=$1`, testWorkspaceID, account.BalanceMicro)
	}
	blockedID := newTask("dispatched")
	if _, err := testHandler.TaskService.StartTask(ctx, parseUUID(blockedID)); !errors.Is(err, service.ErrInsufficientCredits) {
		t.Fatal("expected insufficient credits", err)
	}
	state, err = testHandler.Queries.LockTaskBilling(ctx, parseUUID(blockedID))
	if err != nil || state.Status != "dispatched" || state.LocalBillingEnabled {
		t.Fatalf("failed admission committed %+v %v", state, err)
	}
	if _, err := testHandler.Queries.GetTopupBySession(ctx, db.GetTopupBySessionParams{WorkspaceID: parseUUID(testWorkspaceID), StripeCheckoutID: "cs_nonexistent"}); err == nil {
		t.Fatal("nonexistent session returned")
	}
}

func TestBillingCursorValidation(t *testing.T) {
	for _, q := range []string{"page_size=0", "page_size=101", "page_size=oops", "cursor=garbage", "page=100000"} {
		if _, _, _, err := billingCursor(httptest.NewRequest("GET", "/?"+q, nil)); err == nil {
			t.Errorf("accepted %s", q)
		}
	}
	ts := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	id := parseUUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	got, gotID, limit, err := billingCursor(httptest.NewRequest("GET", "/?cursor="+encodeBillingCursor(ts, id), nil))
	if err != nil || !got.Time.Equal(ts.Time) || gotID != id || limit != 20 {
		t.Fatalf("cursor round trip: %v", err)
	}
}

func TestLocalStripeWebhookSignatureAndMode(t *testing.T) {
	const secret = "whsec_testonly"
	h := &Handler{Billing: &service.Billing{WebhookSecret: secret}}
	body := []byte(`{"id":"evt_1","type":"unrelated.event","livemode":false,"data":{"object":{}}}`)
	signed := webhook.GenerateTestSignedPayload(&webhook.UnsignedPayload{Payload: body, Secret: secret})
	for _, tc := range []struct {
		name, signature string
		body            []byte
		want            int
	}{
		{"signed ignored event", signed.Header, body, 200},
		{"missing signature", "", body, 400},
		{"modified payload", signed.Header, append(append([]byte{}, body...), byte(' ')), 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "/api/webhooks/stripe", bytes.NewReader(tc.body))
			r.Header.Set(stripeSignatureHeader, tc.signature)
			w := httptest.NewRecorder()
			h.HandleCloudBillingStripeWebhook(w, r)
			if w.Code != tc.want {
				t.Fatalf("%d: %s", w.Code, w.Body)
			}
		})
	}
	h.Billing.Live = true
	r := httptest.NewRequest("POST", "/api/webhooks/stripe", bytes.NewReader(body))
	r.Header.Set(stripeSignatureHeader, signed.Header)
	w := httptest.NewRecorder()
	h.HandleCloudBillingStripeWebhook(w, r)
	if w.Code != 400 {
		t.Fatal("test event accepted in live mode")
	}
}

func TestLocalBillingRetiredEndpoints(t *testing.T) {
	h := &Handler{}
	for _, f := range []http.HandlerFunc{h.ListCloudBillingBatches, h.CreateCloudBillingPortalSession} {
		w := httptest.NewRecorder()
		f(w, httptest.NewRequest("GET", "/", nil))
		if w.Code != http.StatusGone {
			t.Fatal(w.Code)
		}
	}
}

func TestLocalStripeWebhookIndependentBurstLimit(t *testing.T) {
	for _, backend := range []string{"memory", "redis"} {
		t.Run(backend, func(t *testing.T) {
			const secret = "whsec_testonly"
			const ip = "192.0.2.1"
			ctx := context.Background()
			low := NewMemoryWebhookIPRateLimiter(DefaultWebhookIPRateLimit())
			ceiling := NewMemoryWebhookAbsoluteIPRateLimiter(DefaultWebhookAbsoluteIPRateLimit())
			if backend == "redis" {
				rdb := newRedisTestClient(t)
				low = NewRedisWebhookIPRateLimiter(rdb, DefaultWebhookIPRateLimit())
				ceiling = NewRedisWebhookAbsoluteIPRateLimiter(rdb, DefaultWebhookAbsoluteIPRateLimit())
			}
			// Other webhook traffic from the same IP must not spend Stripe's budget.
			for range DefaultWebhookIPRateLimit().Limit {
				low.Allow(ctx, ip)
			}
			for range DefaultWebhookAbsoluteIPRateLimit().Limit {
				ceiling.Allow(ctx, ip)
			}
			h := &Handler{
				Billing:              &service.Billing{WebhookSecret: secret},
				WebhookIPRateLimiter: low, WebhookAbsoluteIPRateLimiter: ceiling,
				Metrics: obsmetrics.NewBusinessMetrics(),
			}
			body := []byte(`{"id":"evt_burst","type":"unrelated.event","livemode":false,"data":{"object":{}}}`)
			signed := webhook.GenerateTestSignedPayload(&webhook.UnsignedPayload{Payload: body, Secret: secret})
			send := func(remote string) *httptest.ResponseRecorder {
				r := httptest.NewRequest(http.MethodPost, "/api/webhooks/stripe", bytes.NewReader(body))
				r.RemoteAddr = remote + ":1234"
				r.Header.Set(stripeSignatureHeader, signed.Header)
				w := httptest.NewRecorder()
				h.HandleCloudBillingStripeWebhook(w, r)
				return w
			}
			for i := range 600 {
				if w := send(ip); w.Code != http.StatusOK {
					t.Fatalf("valid request %d rejected: %d %s", i+1, w.Code, w.Body)
				}
			}
			w := send(ip)
			if w.Code != http.StatusTooManyRequests {
				t.Fatalf("request 601: got %d, want 429", w.Code)
			}
			if seconds, err := strconv.Atoi(w.Header().Get("Retry-After")); err != nil || seconds < 1 || seconds > 60 {
				t.Fatalf("invalid Retry-After: %q", w.Header().Get("Retry-After"))
			}
			if w := send("192.0.2.2"); w.Code != http.StatusOK {
				t.Fatalf("different IP rejected: %d", w.Code)
			}
			reg := prometheus.NewRegistry()
			reg.MustRegister(h.Metrics.Collectors()...)
			if err := testutil.GatherAndCompare(reg, strings.NewReader(
				"# HELP iteamify_webhook_rate_limited_total Total webhook admissions or worker dispatches delayed by a bounded safety gate.\n"+
					"# TYPE iteamify_webhook_rate_limited_total counter\n"+
					"iteamify_webhook_rate_limited_total{gate=\"stripe_ip\"} 1\n"), "iteamify_webhook_rate_limited_total"); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestLocalStripeWebhookInvalidTrafficRemainsBounded(t *testing.T) {
	h := &Handler{
		Billing:                      &service.Billing{WebhookSecret: "whsec_testonly"},
		WebhookAbsoluteIPRateLimiter: NewMemoryWebhookAbsoluteIPRateLimiter(WebhookRateLimit{Limit: 2, Window: time.Minute}),
	}
	for _, tc := range []struct {
		body string
		want int
	}{
		{`{}`, http.StatusBadRequest},
		{strings.Repeat("x", maxStripeWebhookBodySize+1), http.StatusRequestEntityTooLarge},
		{`{}`, http.StatusTooManyRequests},
	} {
		r := httptest.NewRequest(http.MethodPost, "/api/webhooks/stripe", strings.NewReader(tc.body))
		w := httptest.NewRecorder()
		h.HandleCloudBillingStripeWebhook(w, r)
		if w.Code != tc.want {
			t.Fatalf("got %d, want %d: %s", w.Code, tc.want, w.Body)
		}
	}
}

func TestLocalStripeWebhookPaidBurstCreditsOnce(t *testing.T) {
	ctx := context.Background()
	ws := parseUUID(uuid.NewString())
	actor := parseUUID(testUserID)
	q := testHandler.Queries
	t.Cleanup(func() {
		for _, table := range []string{"workspace_credit_ledger", "workspace_topup_order", "workspace_credit_account"} {
			if _, err := testPool.Exec(context.Background(), "DELETE FROM "+table+" WHERE workspace_id=$1", ws); err != nil {
				t.Errorf("cleanup %s: %v", table, err)
			}
		}
	})
	if err := q.EnsureCreditAccount(ctx, ws); err != nil {
		t.Fatal(err)
	}
	order, err := q.CreateTopupOrder(ctx, db.CreateTopupOrderParams{
		WorkspaceID: ws, PayerUserID: actor, RequestKey: uuid.NewString(),
		AmountCents: 1000, CreditsMicro: 10_000_000_000, CreditsMicroPerUsd: 1_000_000_000,
		ReturnUrl: "https://example.com/test/billing",
	})
	if err != nil {
		t.Fatal(err)
	}
	const secret = "whsec_testonly"
	b := service.NewBilling(q, testPool, "", secret, "")
	h := &Handler{
		Billing:                      b,
		WebhookIPRateLimiter:         NewMemoryWebhookIPRateLimiter(DefaultWebhookIPRateLimit()),
		WebhookAbsoluteIPRateLimiter: NewMemoryWebhookAbsoluteIPRateLimiter(DefaultWebhookAbsoluteIPRateLimit()),
	}
	session := stripe.CheckoutSession{
		ID: "cs_test_" + uuid.NewString(), Mode: "payment", Currency: "usd", AmountTotal: 1000,
		PaymentStatus: "paid", ClientReferenceID: uuidToString(order.ID),
		Metadata:      map[string]string{"workspace_id": uuidToString(ws), "order_id": uuidToString(order.ID)},
		PaymentIntent: &stripe.PaymentIntent{ID: "pi_" + uuid.NewString()},
	}
	for i := range 100 {
		body, err := json.Marshal(map[string]any{
			"id": fmt.Sprintf("evt_billing_burst_%d", i), "type": "checkout.session.completed",
			"livemode": false, "data": map[string]any{"object": session},
		})
		if err != nil {
			t.Fatal(err)
		}
		signed := webhook.GenerateTestSignedPayload(&webhook.UnsignedPayload{Payload: body, Secret: secret})
		r := httptest.NewRequest(http.MethodPost, "/api/webhooks/stripe", bytes.NewReader(body))
		r.Header.Set(stripeSignatureHeader, signed.Header)
		w := httptest.NewRecorder()
		h.HandleCloudBillingStripeWebhook(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("paid delivery %d: %d %s", i+1, w.Code, w.Body)
		}
	}
	account, err := q.GetCreditAccount(ctx, ws)
	if err != nil || account.BalanceMicro != order.CreditsMicro {
		t.Fatalf("balance after replay: %+v, err %v", account, err)
	}
	var count int
	if err := testPool.QueryRow(ctx, "SELECT count(*) FROM workspace_credit_ledger WHERE workspace_id=$1", ws).Scan(&count); err != nil || count != 1 {
		t.Fatalf("ledger entries after replay: %d, err %v", count, err)
	}
	credited, err := q.GetTopupOrder(ctx, db.GetTopupOrderParams{WorkspaceID: ws, ID: order.ID})
	if err != nil || credited.Status != "credited" || credited.StripePaymentID != session.PaymentIntent.ID {
		t.Fatalf("order after replay: %+v, err %v", credited, err)
	}
}
