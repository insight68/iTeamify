package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
)

func TestInvitationLoginContext(t *testing.T) {
	ctx := context.Background()
	for _, status := range []string{"pending", "accepted", "declined", "expired"} {
		t.Run(status, func(t *testing.T) {
			email := "invitation-login-" + uuid.NewString() + "@example.test"
			inv, err := testHandler.Queries.CreateInvitation(ctx, db.CreateInvitationParams{
				WorkspaceID: parseUUID(testWorkspaceID), InviterID: parseUUID(testUserID), InviteeEmail: email, Role: "member",
			})
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				if _, err := testPool.Exec(ctx, `DELETE FROM workspace_invitation WHERE id=$1`, inv.ID); err != nil {
					t.Error(err)
				}
			})
			if status == "expired" {
				_, err = testPool.Exec(ctx, `UPDATE workspace_invitation SET expires_at=now()-interval '1 second' WHERE id=$1`, inv.ID)
			} else {
				_, err = testPool.Exec(ctx, `UPDATE workspace_invitation SET status=$2 WHERE id=$1`, inv.ID, status)
			}
			if err != nil {
				t.Fatal(err)
			}
			r := withURLParam(httptest.NewRequest(http.MethodGet, "/", nil), "id", uuidToString(inv.ID))
			w := httptest.NewRecorder()
			testHandler.GetInvitationLoginContext(w, r)
			want := http.StatusNotFound
			if status == "pending" {
				want = http.StatusOK
			}
			if w.Code != want {
				t.Fatalf("want %d, got %d: %s", want, w.Code, w.Body.String())
			}
			if w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("invitation login context must not be cached")
			}
			if status == "pending" {
				var result map[string]any
				if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
					t.Fatal(err)
				}
				if len(result) != 1 || result["email"] != email {
					t.Fatalf("expected only the invitee email: %v", result)
				}
				if _, err := testHandler.Queries.GetUserByEmail(ctx, email); !isNotFound(err) {
					t.Fatal("reading the invitation must not create an account")
				}
			}
		})
	}
	for _, tc := range []struct {
		id     string
		status int
	}{{"invalid", http.StatusBadRequest}, {uuid.NewString(), http.StatusNotFound}} {
		r := withURLParam(httptest.NewRequest(http.MethodGet, "/", nil), "id", tc.id)
		w := httptest.NewRecorder()
		testHandler.GetInvitationLoginContext(w, r)
		if w.Code != tc.status {
			t.Fatalf("want %d, got %d: %s", tc.status, w.Code, w.Body.String())
		}
	}
}
