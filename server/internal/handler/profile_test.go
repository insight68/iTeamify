package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func savedQuestionnaire(t *testing.T, userID string) map[string]any {
	t.Helper()
	var raw []byte
	if err := testPool.QueryRow(context.Background(), `SELECT onboarding_questionnaire FROM "user" WHERE id=$1`, userID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var value map[string]any
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func TestProfilePatchKeepsSourceAndWritesFieldsTogether(t *testing.T) {
	id := newTimezoneTestUser(t, "profile-atomic@iteamify.ai")
	_, err := testPool.Exec(context.Background(), `UPDATE "user" SET onboarding_questionnaire='{"source":["search"],"source_skipped":false,"version":2}'::jsonb WHERE id=$1`, id)
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	testHandler.UpdateMe(w, newPatchMeRequest(id, `{"name":"Updated","profile_description":"Go engineer","questionnaire":{"role":"engineer","use_case":["ship_code"]}}`))
	if w.Code != http.StatusOK {
		t.Fatalf("%d: %s", w.Code, w.Body.String())
	}
	var user UserResponse
	if err := json.Unmarshal(w.Body.Bytes(), &user); err != nil {
		t.Fatal(err)
	}
	if user.Name != "Updated" || user.ProfileDescription != "Go engineer" || user.OnboardedAt != nil {
		t.Fatalf("unexpected profile: %+v", user)
	}
	q := savedQuestionnaire(t, id)
	if q["role"] != "engineer" || q["source"].([]any)[0] != "search" {
		t.Fatalf("fields lost: %+v", q)
	}
}

func TestProfileIndependentPatchesDoNotOverwriteEachOther(t *testing.T) {
	id := newTimezoneTestUser(t, "profile-concurrent@iteamify.ai")
	var wg sync.WaitGroup
	responses := make(chan *httptest.ResponseRecorder, 2)
	for _, body := range []string{`{"questionnaire":{"role":"designer"}}`, `{"profile_description":"Working preferences","questionnaire":{"source":["social_github"]}}`} {
		wg.Add(1)
		go func(body string) {
			defer wg.Done()
			w := httptest.NewRecorder()
			testHandler.UpdateMe(w, newPatchMeRequest(id, body))
			responses <- w
		}(body)
	}
	wg.Wait()
	close(responses)
	for w := range responses {
		if w.Code != 200 {
			t.Fatalf("%d: %s", w.Code, w.Body.String())
		}
	}
	q := savedQuestionnaire(t, id)
	if q["role"] != "designer" || q["source"].([]any)[0] != "social_github" {
		t.Fatalf("concurrent fields lost: %+v", q)
	}
}

func TestProfileFreeTextRoleKeepsHistoricalUseCase(t *testing.T) {
	id := newTimezoneTestUser(t, "profile-free-role@iteamify.ai")
	_, err := testPool.Exec(context.Background(), `UPDATE "user" SET onboarding_questionnaire='{"use_case":["manage_team"],"source":["search"]}'::jsonb WHERE id=$1`, id)
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	testHandler.UpdateMe(w, newPatchMeRequest(id, `{"questionnaire":{"role":"other","role_other":"律师","role_skipped":false}}`))
	if w.Code != 200 {
		t.Fatalf("%d: %s", w.Code, w.Body.String())
	}
	q := savedQuestionnaire(t, id)
	if q["role_other"] != "律师" || q["use_case"].([]any)[0] != "manage_team" || q["source"].([]any)[0] != "search" {
		t.Fatalf("profile fields lost: %+v", q)
	}
	if !(questionnaireAnswers{Role: "other", RoleOther: "律师", Version: 2}).complete() {
		t.Fatal("role-only profile must be complete without use cases")
	}
}

func TestLegacyOnboardingPatchMergesQuestionnaire(t *testing.T) {
	id := newTimezoneTestUser(t, "profile-legacy@iteamify.ai")
	for _, body := range []string{`{"questionnaire":{"role":"founder","use_case":["manage_team"]}}`, `{"questionnaire":{"source":"search"}}`} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest("PATCH", "/api/me/onboarding", strings.NewReader(body))
		req.Header.Set("X-User-ID", id)
		testHandler.PatchOnboarding(w, req)
		if w.Code != 200 {
			t.Fatalf("%d: %s", w.Code, w.Body.String())
		}
	}
	q := savedQuestionnaire(t, id)
	if q["role"] != "founder" || q["use_case"].([]any)[0] != "manage_team" || q["source"].([]any)[0] != "search" {
		t.Fatalf("legacy patch lost fields: %+v", q)
	}
}

func TestProfileRejectsMalformedQuestionnaireAtomically(t *testing.T) {
	id := newTimezoneTestUser(t, "profile-invalid@iteamify.ai")
	for _, patch := range []string{`[]`, `"text"`, `{"role":"administrator"}`, `{"use_case":[""]}`, `{"role_skipped":null}`, `{"unknown":1}`, `{"version":99}`} {
		w := httptest.NewRecorder()
		testHandler.UpdateMe(w, newPatchMeRequest(id, `{"name":"Must not save","questionnaire":`+patch+`}`))
		if w.Code != 400 {
			t.Fatalf("patch %s: %d: %s", patch, w.Code, w.Body.String())
		}
	}
	var name string
	if err := testPool.QueryRow(context.Background(), `SELECT name FROM "user" WHERE id=$1`, id).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Timezone Test" {
		t.Fatalf("invalid patch changed name: %s", name)
	}
}
