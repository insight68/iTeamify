package service

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/iteamify-ai/iteamify/server/internal/util"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	stripe "github.com/stripe/stripe-go/v84"
)

const MicroPerCredit int64 = 1_000_000

var (
	ErrInsufficientCredits = errors.New("workspace credit balance is below the allowed limit")
	ErrBillingUnavailable  = errors.New("credit purchases are not configured")
	ErrBillingConflict     = errors.New("billing operation conflicts with its persisted identity")
	ErrInvalidBillingInput = errors.New("invalid billing input")
)

// Billing owns the local wallet. Stripe is only used to collect money.
type Billing struct {
	Queries       *db.Queries
	TxStarter     TxStarter
	Stripe        *stripe.Client
	WebhookSecret string
	Live          bool
	AppURL        string
}

func NewBilling(q *db.Queries, tx TxStarter, key, webhookSecret, appURL string) *Billing {
	b := &Billing{Queries: q, TxStarter: tx, WebhookSecret: webhookSecret, Live: strings.HasPrefix(key, "sk_live_"), AppURL: strings.TrimRight(appURL, "/")}
	if key != "" && webhookSecret != "" {
		b.Stripe = stripe.NewClient(key, stripe.WithBackends(stripe.NewBackends(&http.Client{Timeout: 20 * time.Second})))
	}
	return b
}

func ValidateStripeConfig(key, secret, appURL string) error {
	if key == "" && secret == "" {
		return nil
	}
	u, err := url.Parse(appURL)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || (u.Scheme != "https" && u.Scheme != "http") {
		return errors.New("Stripe requires a valid application origin")
	}
	if (!strings.HasPrefix(key, "sk_test_") && !strings.HasPrefix(key, "sk_live_")) || !strings.HasPrefix(secret, "whsec_") {
		return errors.New("Stripe secret key and webhook secret must be configured together")
	}
	if strings.HasPrefix(key, "sk_live_") && u.Scheme != "https" {
		return errors.New("live Stripe requires HTTPS")
	}
	return nil
}

// CreditLocked is called only after locking this workspace's account. All
// writers use account -> source row ordering; there are no network calls here.
func CreditLocked(ctx context.Context, q *db.Queries, ws pgtype.UUID, key, kind string, amount int64, ref string, actor pgtype.UUID, description string) error {
	prior, err := q.GetCreditLedgerByKey(ctx, db.GetCreditLedgerByKeyParams{WorkspaceID: ws, BusinessKey: key})
	if err == nil {
		if prior.AmountMicro != amount || prior.Kind != kind || prior.ReferenceID != ref || prior.Description != description {
			return ErrBillingConflict
		}
		return nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if amount == 0 {
		return ErrInvalidBillingInput
	}
	account, err := q.AddCreditBalance(ctx, db.AddCreditBalanceParams{WorkspaceID: ws, AmountMicro: amount})
	if err != nil {
		return err
	}
	_, err = q.InsertCreditLedger(ctx, db.InsertCreditLedgerParams{WorkspaceID: ws, BusinessKey: key, Kind: kind, AmountMicro: amount, BalanceAfter: account.BalanceMicro, ReferenceID: ref, ActorID: actor, Description: description})
	return err
}

func GrantWorkspaceTrial(ctx context.Context, q *db.Queries, ws, actor pgtype.UUID) error {
	if err := q.EnsureCreditAccount(ctx, ws); err != nil {
		return err
	}
	if _, err := q.LockCreditAccount(ctx, ws); err != nil {
		return err
	}
	return CreditLocked(ctx, q, ws, "workspace_trial:"+util.UUIDToString(ws), "trial", 1000*MicroPerCredit, "", actor, "")
}

func CreditsForTopup(cents, rate int64) (int64, error) {
	if cents < 50 || cents > 99_999_999 || rate <= 0 {
		return 0, ErrInvalidBillingInput
	}
	v := new(big.Int).Mul(big.NewInt(cents), big.NewInt(rate))
	rem := new(big.Int)
	v.QuoRem(v, big.NewInt(100), rem)
	if !v.IsInt64() || v.Sign() <= 0 || rem.Sign() != 0 {
		return 0, ErrInvalidBillingInput
	}
	return v.Int64(), nil
}

func (b *Billing) Checkout(ctx context.Context, ws, actor pgtype.UUID, requestKey string, cents int64) (db.WorkspaceTopupOrder, error) {
	if b.Stripe == nil {
		return db.WorkspaceTopupOrder{}, ErrBillingUnavailable
	}
	if len(requestKey) < 8 || len(requestKey) > 128 {
		return db.WorkspaceTopupOrder{}, ErrInvalidBillingInput
	}
	order, err := b.Queries.GetTopupOrderByRequest(ctx, db.GetTopupOrderByRequestParams{WorkspaceID: ws, PayerUserID: actor, RequestKey: requestKey})
	if errors.Is(err, pgx.ErrNoRows) {
		// Lock the account while creating the order, sharing the workspace-delete
		// fence. Release the transaction before contacting Stripe.
		tx, e := b.TxStarter.Begin(ctx)
		if e != nil {
			return order, e
		}
		defer tx.Rollback(ctx)
		q := b.Queries.WithTx(tx)
		if _, e = q.LockCreditAccount(ctx, ws); e != nil {
			return order, e
		}
		workspace, e := q.GetWorkspace(ctx, ws)
		if e != nil {
			return order, e
		}
		settings, e := q.GetBillingSettings(ctx)
		if e != nil {
			return order, e
		}
		allowed := false
		for _, a := range settings.TopupAmountsCents {
			if a == cents {
				allowed = true
			}
		}
		if !allowed {
			return order, ErrInvalidBillingInput
		}
		credits, e := CreditsForTopup(cents, settings.CreditsMicroPerUsd)
		if e != nil {
			return order, e
		}
		order, e = q.CreateTopupOrder(ctx, db.CreateTopupOrderParams{WorkspaceID: ws, PayerUserID: actor, RequestKey: requestKey, AmountCents: cents, CreditsMicro: credits, CreditsMicroPerUsd: settings.CreditsMicroPerUsd, ReturnUrl: b.AppURL + "/" + url.PathEscape(workspace.Slug) + "/billing"})
		if e != nil {
			return order, e
		}
		if e = tx.Commit(ctx); e != nil {
			return order, e
		}
	} else if err != nil {
		return order, err
	}
	if order.AmountCents != cents {
		return order, ErrBillingConflict
	}
	if order.Status != "pending" {
		return order, ErrBillingConflict
	}
	if order.StripeCheckoutID != "" {
		return order, nil
	}
	// Stripe's idempotency cache is bounded. Never mint a second session for
	// an old ambiguous attempt after its key may have expired.
	if time.Since(order.CreatedAt.Time) > 23*time.Hour {
		return order, ErrBillingConflict
	}
	params := &stripe.CheckoutSessionCreateParams{
		Mode: stripe.String("payment"), PaymentMethodTypes: []*string{stripe.String("card")},
		ClientReferenceID: stripe.String(util.UUIDToString(order.ID)),
		Metadata:          map[string]string{"workspace_id": util.UUIDToString(ws), "order_id": util.UUIDToString(order.ID)},
		SuccessURL:        stripe.String(order.ReturnUrl + "?session_id={CHECKOUT_SESSION_ID}"), CancelURL: stripe.String(order.ReturnUrl),
		LineItems: []*stripe.CheckoutSessionCreateLineItemParams{{Quantity: stripe.Int64(1), PriceData: &stripe.CheckoutSessionCreateLineItemPriceDataParams{Currency: stripe.String("usd"), UnitAmount: stripe.Int64(order.AmountCents), ProductData: &stripe.CheckoutSessionCreateLineItemPriceDataProductDataParams{Name: stripe.String("Workspace credits")}}}},
	}
	params.SetIdempotencyKey("workspace_topup:" + util.UUIDToString(order.ID))
	session, err := b.Stripe.V1CheckoutSessions.Create(ctx, params)
	if err != nil {
		return order, ErrBillingUnavailable
	}
	u, e := url.Parse(session.URL)
	if e != nil || u.Scheme != "https" || u.Host != "checkout.stripe.com" || session.ID == "" {
		return order, ErrBillingUnavailable
	}
	return b.Queries.AttachTopupSession(ctx, db.AttachTopupSessionParams{WorkspaceID: ws, ID: order.ID, StripeCheckoutID: session.ID, CheckoutUrl: session.URL})
}

// Fulfill can be called by a verified webhook or an administrator retrieving
// the session from Stripe. An order, not an event ID, is the credit identity.
func (b *Billing) Fulfill(ctx context.Context, session *stripe.CheckoutSession, eventID string) error {
	if session.Livemode != b.Live || session.Mode != "payment" {
		return ErrBillingConflict
	}
	ws, err := util.ParseUUID(session.Metadata["workspace_id"])
	if err != nil {
		return ErrInvalidBillingInput
	}
	id, err := util.ParseUUID(session.ClientReferenceID)
	if err != nil {
		return ErrInvalidBillingInput
	}
	if session.Metadata["order_id"] != session.ClientReferenceID || session.ID == "" {
		return ErrBillingConflict
	}
	tx, err := b.TxStarter.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := b.Queries.WithTx(tx)
	if _, err = q.LockCreditAccount(ctx, ws); err != nil {
		return err
	}
	order, err := q.LockTopupOrder(ctx, db.LockTopupOrderParams{WorkspaceID: ws, ID: id})
	if err != nil {
		return err
	}
	if (order.StripeCheckoutID != "" && order.StripeCheckoutID != session.ID) || session.AmountTotal != order.AmountCents || session.Currency != "usd" {
		return ErrBillingConflict
	}
	if session.PaymentStatus != "paid" {
		if session.Status == "expired" {
			if err = q.CancelTopupOrder(ctx, db.CancelTopupOrderParams{WorkspaceID: ws, ID: id, StripeCheckoutID: session.ID}); err != nil {
				return err
			}
		}
		return tx.Commit(ctx)
	}
	if session.PaymentIntent == nil || session.PaymentIntent.ID == "" {
		return ErrBillingConflict
	}
	if order.Status == "credited" {
		if order.StripePaymentID != session.PaymentIntent.ID {
			return ErrBillingConflict
		}
		return tx.Commit(ctx)
	}
	if err = CreditLocked(ctx, q, ws, "topup:"+util.UUIDToString(id), "topup", order.CreditsMicro, util.UUIDToString(id), order.PayerUserID, ""); err != nil {
		return err
	}
	err = q.FulfillTopupOrder(ctx, db.FulfillTopupOrderParams{WorkspaceID: ws, ID: id, StripeCheckoutID: session.ID, StripePaymentID: session.PaymentIntent.ID, StripeEventID: eventID})
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func UsageCreditKey(taskID, provider, model string, cumulative int64) string {
	dimension := fmt.Sprintf("%x", sha256.Sum256([]byte(provider+"\x00"+model)))
	return fmt.Sprintf("usage:%s:%s:%s", taskID, dimension, strconv.FormatInt(cumulative, 10))
}
