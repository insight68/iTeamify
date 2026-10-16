package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/iteamify-ai/iteamify/server/internal/assistantresource"
	"github.com/iteamify-ai/iteamify/server/internal/service"
	"github.com/iteamify-ai/iteamify/server/internal/util"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
)

func TestAssistantResourceCatalogFiltersCompanyUpdateByRole(t *testing.T) {
	registry := newAssistantResourceRegistry(&Handler{})
	member := registry.Catalog(assistantresource.Principal{Role: "member"})
	owner := registry.Catalog(assistantresource.Principal{Role: "owner"})

	memberCompany := findAssistantDefinition(t, member, "company_profile")
	if len(memberCompany.Actions) != 0 {
		t.Fatalf("member company actions = %#v", memberCompany.Actions)
	}
	ownerCompany := findAssistantDefinition(t, owner, "company_profile")
	if len(ownerCompany.Actions) != 1 || ownerCompany.Actions[0].Name != "update" {
		t.Fatalf("owner company actions = %#v", ownerCompany.Actions)
	}
	schema, err := json.Marshal(ownerCompany.Actions[0].InputSchema)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{`"/offers"`, `"type":"array"`, "Complete collection value"} {
		if !strings.Contains(string(schema), expected) {
			t.Fatalf("company update schema does not contain %q: %s", expected, schema)
		}
	}
}

func TestBusinessAssistantChangesUsesValidatedBeforeAndAfterValues(t *testing.T) {
	changes := businessAssistantChanges(
		service.BusinessContent{Summary: "Before", Offers: []service.BusinessOffer{}},
		service.BusinessContent{Summary: "After", Offers: []service.BusinessOffer{{Name: "Procurement assistant"}}},
		[]service.BusinessChangeOperation{{Path: "/summary"}, {Path: "/offers"}},
	)
	if len(changes) != 2 || changes[0].Before != "Before" || changes[0].After != "After" {
		t.Fatalf("unexpected summary change: %#v", changes)
	}
	afterOffers, ok := changes[1].After.([]any)
	if !ok || len(afterOffers) != 1 {
		t.Fatalf("unexpected offers change: %#v", changes[1])
	}
}

func TestWriteBusinessProposalInvalidIncludesOperationDetail(t *testing.T) {
	recorder := httptest.NewRecorder()
	writeBusinessProposalInvalid(recorder, &service.BusinessOperationValidationError{
		OperationIndex: 0,
		Field:          "value",
		Path:           "/offers",
		Expected:       "array of offer objects",
		Actual:         "object",
	})
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response["code"] != "invalid_business_operation" || response["path"] != "/offers" ||
		response["expected"] != "array of offer objects" || response["actual"] != "object" {
		t.Fatalf("response = %#v", response)
	}
}

func TestAssistantOperationReplayReturnsStoredResult(t *testing.T) {
	request := assistantresource.ActionRequest{
		Resource: "company_profile", ResourceID: "current", Action: "update",
		Input: map[string]any{"priority": "high"}, Confirmed: true,
		IdempotencyKey: "task-1:lead-1:update-priority",
	}
	encodedRequest, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	result := assistantresource.ActionResult{Resource: "company_profile", ResourceID: "current", Action: "update"}
	encodedResult, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	taskID, err := util.ParseUUID("11111111-1111-1111-1111-111111111111")
	if err != nil {
		t.Fatal(err)
	}
	operationID, err := util.ParseUUID("22222222-2222-2222-2222-222222222222")
	if err != nil {
		t.Fatal(err)
	}
	operation := db.AssistantOperation{
		ID: operationID, TaskID: taskID, ResourceType: "company_profile", Action: "update",
		Status: "succeeded", Request: encodedRequest, Result: encodedResult,
	}
	recorder := httptest.NewRecorder()
	(&Handler{}).writeAssistantOperationReplay(recorder, operation, request, resolvedAssistantPrincipal{TaskUUID: taskID})
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response assistantActionExecutionResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if !response.Replayed || response.OperationID != "22222222-2222-2222-2222-222222222222" {
		t.Fatalf("response = %#v", response)
	}
}

func TestAssistantOperationReplayRejectsChangedPayload(t *testing.T) {
	stored := assistantresource.ActionRequest{
		Resource: "company_profile", ResourceID: "current", Action: "update",
		Input: map[string]any{"priority": "normal"}, Confirmed: true,
	}
	encoded, err := json.Marshal(stored)
	if err != nil {
		t.Fatal(err)
	}
	taskID, _ := util.ParseUUID("11111111-1111-1111-1111-111111111111")
	recorder := httptest.NewRecorder()
	(&Handler{}).writeAssistantOperationReplay(recorder, db.AssistantOperation{
		TaskID: taskID, ResourceType: "company_profile", Action: "update", Status: "succeeded", Request: encoded,
	}, assistantresource.ActionRequest{
		Resource: "company_profile", ResourceID: "current", Action: "update",
		Input: map[string]any{"priority": "high"}, Confirmed: true,
	}, resolvedAssistantPrincipal{TaskUUID: taskID})
	if recorder.Code != http.StatusConflict {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func findAssistantDefinition(t *testing.T, definitions []assistantresource.Definition, name string) assistantresource.Definition {
	t.Helper()
	for _, definition := range definitions {
		if definition.Name == name {
			return definition
		}
	}
	t.Fatalf("resource %q not found in %#v", name, definitions)
	return assistantresource.Definition{}
}
