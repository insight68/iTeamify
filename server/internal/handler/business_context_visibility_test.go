package handler

import (
	"reflect"
	"testing"

	"github.com/iteamify-ai/iteamify/server/internal/service"
)

func TestBusinessContextForRoleRedactsDraftForRegularMember(t *testing.T) {
	published := service.BusinessContent{BusinessName: "Published company", Positioning: "Published positioning"}
	state := service.BusinessContextState{
		DraftRevision:         8,
		Draft:                 service.BusinessContent{BusinessName: "Secret draft", Positioning: "Unreleased positioning"},
		Published:             &published,
		HasUnpublishedChanges: true,
		ValidationIssues:      []service.BusinessValidationIssue{{Path: "/offers", Message: "missing"}},
	}

	got := businessContextForRole(state, "member")
	if !reflect.DeepEqual(got.Draft, published) {
		t.Fatalf("member draft = %#v, want published content only", got.Draft)
	}
	if got.DraftRevision != 0 || got.HasUnpublishedChanges || len(got.ValidationIssues) != 0 {
		t.Fatalf("member response leaked draft metadata: %#v", got)
	}
}

func TestBusinessContextForRolePreservesDraftForManagers(t *testing.T) {
	state := service.BusinessContextState{
		DraftRevision:         3,
		Draft:                 service.BusinessContent{BusinessName: "Working draft"},
		HasUnpublishedChanges: true,
	}
	for _, role := range []string{"owner", "admin"} {
		if got := businessContextForRole(state, role); !reflect.DeepEqual(got, state) {
			t.Fatalf("%s response changed: %#v", role, got)
		}
	}
}

func TestBusinessContextForRoleReturnsEmptyDraftWithoutPublishedRelease(t *testing.T) {
	state := service.BusinessContextState{
		DraftRevision: 2,
		Draft:         service.BusinessContent{BusinessName: "Unpublished company"},
	}
	got := businessContextForRole(state, "member")
	if !reflect.DeepEqual(got.Draft, service.EmptyBusinessContent()) {
		t.Fatalf("member without release received draft: %#v", got.Draft)
	}
}
