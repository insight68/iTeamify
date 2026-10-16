package handler

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/iteamify-ai/iteamify/server/internal/service"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	stripe "github.com/stripe/stripe-go/v84"
	"github.com/stripe/stripe-go/v84/webhook"
)

const maxStripeWebhookBodySize = 1 << 20
const stripeSignatureHeader = "Stripe-Signature"

// API paths remain stable for installed clients, but only the local wallet
// owns these responses. There is no Cloud billing fallback.
func (h *Handler) billingError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		writeError(w, 404, "billing record not found")
	case errors.Is(err, service.ErrBillingUnavailable):
		writeError(w, 503, err.Error())
	case errors.Is(err, service.ErrInvalidBillingInput):
		writeError(w, 400, err.Error())
	case errors.Is(err, service.ErrBillingConflict):
		writeError(w, 409, err.Error())
	default:
		slog.Error("local billing operation failed", "error", err)
		writeError(w, 500, "billing operation failed")
	}
}
func (h *Handler) GetCloudBillingBalance(w http.ResponseWriter, r *http.Request) {
	ws, ok := parseUUIDOrBadRequest(w, ctxWorkspaceID(r.Context()), "workspace_id")
	if !ok {
		return
	}
	a, err := h.Queries.GetCreditAccount(r.Context(), ws)
	if err != nil {
		h.billingError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"workspace_id": uuidToString(ws), "owner_id": uuidToString(ws), "balance_micro": a.BalanceMicro, "balance_credit": float64(a.BalanceMicro) / 1e6, "updated_at": a.UpdatedAt})
}

func (h *Handler) GetWorkspaceCreditUsage(w http.ResponseWriter, r *http.Request) {
	ws, ok := parseUUIDOrBadRequest(w, ctxWorkspaceID(r.Context()), "workspace_id")
	if !ok {
		return
	}
	project, ok := parseProjectIDParam(w, r)
	if !ok {
		return
	}
	since := parseExactSinceParamInTZ(r, 30, h.resolveViewingTZ(r))
	usage, err := h.Queries.GetWorkspaceCreditUsageSince(r.Context(), db.GetWorkspaceCreditUsageSinceParams{WorkspaceID: ws, Since: since, ProjectID: project})
	if err != nil {
		h.billingError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"workspace_id": uuidToString(ws), "credit_micro": usage})
}
func (h *Handler) ListCloudBillingPriceTiers(w http.ResponseWriter, r *http.Request) {
	if h.Billing.Stripe == nil {
		h.billingError(w, service.ErrBillingUnavailable)
		return
	}
	settings, err := h.Queries.GetBillingSettings(r.Context())
	if err != nil {
		h.billingError(w, err)
		return
	}
	items := make([]map[string]any, 0, len(settings.TopupAmountsCents))
	for _, amount := range settings.TopupAmountsCents {
		credits, err := service.CreditsForTopup(amount, settings.CreditsMicroPerUsd)
		if err != nil {
			continue
		}
		items = append(items, map[string]any{"id": strconv.FormatInt(amount, 10), "display_name": "USD " + strconv.FormatFloat(float64(amount)/100, 'f', 2, 64), "amount_cents": amount, "credits": float64(credits) / 1e6, "bonus_credits": 0})
	}
	writeJSON(w, 200, items)
}
func (h *Handler) CreateCloudBillingCheckoutSession(w http.ResponseWriter, r *http.Request) {
	ws, ok := parseUUIDOrBadRequest(w, ctxWorkspaceID(r.Context()), "workspace_id")
	if !ok {
		return
	}
	actor, ok := requireUserID(w, r)
	if !ok {
		return
	}
	var req struct {
		TierID     string `json:"tier_id"`
		RequestKey string `json:"request_key"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&req); err != nil {
		writeError(w, 400, "invalid checkout request")
		return
	}
	cents, err := strconv.ParseInt(req.TierID, 10, 64)
	if err != nil {
		h.billingError(w, service.ErrInvalidBillingInput)
		return
	}
	if req.RequestKey == "" {
		req.RequestKey = r.Header.Get("Idempotency-Key")
	}
	if req.RequestKey == "" {
		req.RequestKey = uuid.NewString()
	} // Old clients lack request_key.
	order, err := h.Billing.Checkout(r.Context(), ws, parseUUID(actor), req.RequestKey, cents)
	if err != nil {
		h.billingError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"workspace_id": uuidToString(ws), "order_id": uuidToString(order.ID), "session_id": order.StripeCheckoutID, "url": order.CheckoutUrl})
}
func isValidStripeSessionID(s string) bool {
	if !strings.HasPrefix(s, "cs_") || len(s) > 255 {
		return false
	}
	for _, c := range s {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_') {
			return false
		}
	}
	return true
}
func topupResponse(o db.WorkspaceTopupOrder) map[string]any {
	return map[string]any{"id": uuidToString(o.ID), "order_id": uuidToString(o.ID), "owner_id": uuidToString(o.WorkspaceID), "workspace_id": uuidToString(o.WorkspaceID), "amount_cents": o.AmountCents, "currency": "usd", "credits": float64(o.CreditsMicro) / 1e6, "bonus_credits": 0, "status": o.Status, "tier_id": strconv.FormatInt(o.AmountCents, 10), "stripe_checkout_id": o.StripeCheckoutID, "created_at": o.CreatedAt, "updated_at": o.UpdatedAt}
}
func (h *Handler) GetCloudBillingCheckoutSession(w http.ResponseWriter, r *http.Request) {
	ws, ok := parseUUIDOrBadRequest(w, ctxWorkspaceID(r.Context()), "workspace_id")
	if !ok {
		return
	}
	session := chi.URLParam(r, "sessionId")
	if !isValidStripeSessionID(session) {
		writeError(w, 400, "invalid session_id")
		return
	}
	order, err := h.Queries.GetTopupBySession(r.Context(), db.GetTopupBySessionParams{WorkspaceID: ws, StripeCheckoutID: session})
	if err != nil {
		h.billingError(w, err)
		return
	}
	writeJSON(w, 200, topupResponse(order))
}
func billingCursor(r *http.Request) (pgtype.Timestamptz, pgtype.UUID, int32, error) {
	var ts pgtype.Timestamptz
	var id pgtype.UUID
	limit := int64(20)
	if raw := r.URL.Query().Get("page_size"); raw != "" {
		var err error
		limit, err = strconv.ParseInt(raw, 10, 32)
		if err != nil || limit < 1 || limit > 100 {
			return ts, id, 0, service.ErrInvalidBillingInput
		}
	}
	if page := r.URL.Query().Get("page"); page != "" && page != "1" {
		return ts, id, 0, service.ErrInvalidBillingInput
	}
	if cursor := r.URL.Query().Get("cursor"); cursor != "" {
		raw, err := base64.RawURLEncoding.DecodeString(cursor)
		if err != nil {
			return ts, id, 0, service.ErrInvalidBillingInput
		}
		parts := strings.Split(string(raw), "|")
		if len(parts) != 2 {
			return ts, id, 0, service.ErrInvalidBillingInput
		}
		t, err := time.Parse(time.RFC3339Nano, parts[0])
		if err != nil {
			return ts, id, 0, service.ErrInvalidBillingInput
		}
		if err = id.Scan(parts[1]); err != nil {
			return ts, id, 0, service.ErrInvalidBillingInput
		}
		ts = pgtype.Timestamptz{Time: t, Valid: true}
	}
	return ts, id, int32(limit), nil
}
func encodeBillingCursor(ts pgtype.Timestamptz, id pgtype.UUID) string {
	return base64.RawURLEncoding.EncodeToString([]byte(ts.Time.UTC().Format(time.RFC3339Nano) + "|" + uuidToString(id)))
}
func (h *Handler) ListCloudBillingTransactions(w http.ResponseWriter, r *http.Request) {
	ws, ok := parseUUIDOrBadRequest(w, ctxWorkspaceID(r.Context()), "workspace_id")
	if !ok {
		return
	}
	ts, id, limit, err := billingCursor(r)
	if err != nil {
		h.billingError(w, err)
		return
	}
	rows, err := h.Queries.ListCreditLedger(r.Context(), db.ListCreditLedgerParams{WorkspaceID: ws, BeforeTime: ts, BeforeID: id, PageLimit: limit + 1})
	if err != nil {
		h.billingError(w, err)
		return
	}
	next := ""
	if len(rows) > int(limit) {
		rows = rows[:limit]
		last := rows[len(rows)-1]
		next = encodeBillingCursor(last.CreatedAt, last.ID)
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		kind := row.Kind
		if kind == "usage" {
			kind = "deduction"
		}
		items = append(items, map[string]any{"id": uuidToString(row.ID), "owner_id": uuidToString(ws), "workspace_id": uuidToString(ws), "idempotency_key": row.BusinessKey, "tx_type": kind, "source": row.Kind, "amount_micro": row.AmountMicro, "balance_after": row.BalanceAfter, "reference_id": row.ReferenceID, "description": row.Description, "metadata": map[string]any{}, "created_at": row.CreatedAt})
	}
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": next, "page": 1, "page_size": limit})
}
func (h *Handler) ListCloudBillingTopups(w http.ResponseWriter, r *http.Request) {
	ws, ok := parseUUIDOrBadRequest(w, ctxWorkspaceID(r.Context()), "workspace_id")
	if !ok {
		return
	}
	ts, id, limit, err := billingCursor(r)
	if err != nil {
		h.billingError(w, err)
		return
	}
	rows, err := h.Queries.ListTopupOrders(r.Context(), db.ListTopupOrdersParams{WorkspaceID: ws, BeforeTime: ts, BeforeID: id, PageLimit: limit + 1})
	if err != nil {
		h.billingError(w, err)
		return
	}
	next := ""
	if len(rows) > int(limit) {
		rows = rows[:limit]
		last := rows[len(rows)-1]
		next = encodeBillingCursor(last.CreatedAt, last.ID)
	}
	items := make([]map[string]any, 0, len(rows))
	for _, o := range rows {
		items = append(items, topupResponse(o))
	}
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": next, "page": 1, "page_size": limit})
}
func (h *Handler) ListCloudBillingBatches(w http.ResponseWriter, r *http.Request) {
	writeError(w, 410, "credit batches are not supported")
}
func (h *Handler) CreateCloudBillingPortalSession(w http.ResponseWriter, r *http.Request) {
	writeError(w, 410, "subscription portal is not supported")
}
func (h *Handler) HandleCloudBillingStripeWebhook(w http.ResponseWriter, r *http.Request) {
	if h.Billing == nil || h.Billing.WebhookSecret == "" {
		h.billingError(w, service.ErrBillingUnavailable)
		return
	}
	// Stripe shares sender IPs across customers and may deliver retry bursts.
	// Retain the high ingress ceiling, with a separate key from other hooks;
	// legitimate payments must not consume the low bad-credential budget.
	if h.WebhookAbsoluteIPRateLimiter != nil {
		if ip := h.clientIPForRateLimit(r); ip != "" {
			key := "stripe:" + ip
			if !h.WebhookAbsoluteIPRateLimiter.Allow(r.Context(), key) {
				writeWebhookRateLimit(w, r, h.WebhookAbsoluteIPRateLimiter, key, "stripe_ip", h.Metrics)
				return
			}
		}
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxStripeWebhookBodySize))
	if err != nil {
		writeError(w, 413, "invalid webhook payload")
		return
	}
	// Stripe's SDK verifies the raw bytes. Only stable Checkout fields are
	// consumed, and every money/ownership field is independently validated.
	if err = webhook.ValidatePayload(body, r.Header.Get(stripeSignatureHeader), h.Billing.WebhookSecret); err != nil {
		writeError(w, 400, "invalid Stripe signature")
		return
	}
	var event stripe.Event
	if err = json.Unmarshal(body, &event); err != nil || event.ID == "" || event.Data == nil {
		writeError(w, 400, "invalid Stripe event")
		return
	}
	if event.Livemode != h.Billing.Live {
		writeError(w, 400, "Stripe mode mismatch")
		return
	}
	if event.Type != "checkout.session.completed" && event.Type != "checkout.session.async_payment_succeeded" && event.Type != "checkout.session.expired" {
		writeJSON(w, 200, map[string]bool{"received": true})
		return
	}
	var session stripe.CheckoutSession
	if err = json.Unmarshal(event.Data.Raw, &session); err != nil {
		writeError(w, 400, "invalid Checkout session")
		return
	}
	if err = h.Billing.Fulfill(r.Context(), &session, event.ID); err != nil {
		h.billingError(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"received": true})
}
