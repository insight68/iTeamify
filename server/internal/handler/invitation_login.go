package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
)

// GetInvitationLoginContext resolves only the email needed by the login form.
// Possession of the invitation URL does not authenticate or accept the invite.
func (h *Handler) GetInvitationLoginContext(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "invitation id")
	if !ok {
		return
	}
	inv, err := h.Queries.GetInvitation(r.Context(), id)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "invitation not found")
		} else {
			writeError(w, http.StatusServiceUnavailable, "invitation unavailable")
		}
		return
	}
	if inv.Status != "pending" || !inv.ExpiresAt.Valid || !inv.ExpiresAt.Time.After(time.Now()) {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"email": inv.InviteeEmail})
}
