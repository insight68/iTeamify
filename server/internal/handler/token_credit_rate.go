package handler

import (
	"errors"
	"net/http"

	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5"
)

const microcreditsPerCredit int64 = 1_000_000

type tokenCreditRateResponse struct {
	Version                      int64   `json:"version"`
	CreditsPerMillionTokens      float64 `json:"credits_per_million_tokens"`
	CreditsMicroPerMillionTokens int64   `json:"credits_micro_per_million_tokens"`
	CreatedAt                    string  `json:"created_at"`
}

func tokenCreditRateToResponse(rate db.TokenCreditRate) tokenCreditRateResponse {
	return tokenCreditRateResponse{
		Version:                      rate.Version,
		CreditsPerMillionTokens:      float64(rate.CreditsMicroPerMillionTokens) / float64(microcreditsPerCredit),
		CreditsMicroPerMillionTokens: rate.CreditsMicroPerMillionTokens,
		CreatedAt:                    rate.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

// GetTokenCreditRate returns the one deployment-wide user billing rate. The
// rate is intentionally model-agnostic: input, output, cache-read, and
// cache-write tokens all consume the same number of credits.
func (h *Handler) GetTokenCreditRate(w http.ResponseWriter, r *http.Request) {
	rate, err := h.Queries.GetActiveTokenCreditRate(r.Context())
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{
				"error": "token credit rate is not configured",
				"code":  "token_credit_rate_unavailable",
			})
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load token credit rate")
		return
	}
	writeJSON(w, http.StatusOK, tokenCreditRateToResponse(rate))
}

// UpdateTokenCreditRate creates a new immutable rate version and activates it.
// Existing usage facts remain attributable to the rate version captured by
// their eventual settlement; no model- or customer-specific override exists.
