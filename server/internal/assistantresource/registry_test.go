package assistantresource

import (
	"context"
	"errors"
	"testing"
)

type fakeAdapter struct {
	definition Definition
}

func (f fakeAdapter) Definition() Definition { return f.definition }
func (f fakeAdapter) Query(_ context.Context, _ Principal, request QueryRequest) (QueryResult, error) {
	return QueryResult{Resource: request.Resource, Rows: []any{}, Count: 0}, nil
}
func (f fakeAdapter) Get(context.Context, Principal, string) (any, error) {
	return map[string]any{}, nil
}
func (f fakeAdapter) Preview(_ context.Context, _ Principal, request ActionRequest) (ActionPreview, error) {
	return ActionPreview{Summary: request.Action}, nil
}
func (f fakeAdapter) Execute(_ context.Context, _ Principal, request ActionRequest) (ActionResult, error) {
	return ActionResult{Resource: request.Resource, ResourceID: request.ResourceID, Action: request.Action}, nil
}

func TestRegistryFiltersActionsByRole(t *testing.T) {
	registry := New()
	err := registry.Register(fakeAdapter{definition: Definition{
		Name: "company_profile", Version: 1, ReadRoles: []string{"member", "admin", "owner"},
		Actions: []ActionDefinition{{Name: "update", AllowedRoles: []string{"admin", "owner"}}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	memberCatalog := registry.Catalog(Principal{Role: "member"})
	if len(memberCatalog) != 1 || len(memberCatalog[0].Actions) != 0 {
		t.Fatalf("member catalog = %#v", memberCatalog)
	}
	adminCatalog := registry.Catalog(Principal{Role: "admin"})
	if len(adminCatalog) != 1 || len(adminCatalog[0].Actions) != 1 {
		t.Fatalf("admin catalog = %#v", adminCatalog)
	}
}

func TestRegistryRequiresConfirmationAndVersion(t *testing.T) {
	registry := New()
	err := registry.Register(fakeAdapter{definition: Definition{
		Name: "lead", Version: 1,
		Actions: []ActionDefinition{{
			Name: "update", RequiresID: true, RequiresVersion: true,
			Confirmation: ConfirmationExplicit,
		}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	_, err = registry.Execute(context.Background(), Principal{}, ActionRequest{Resource: "lead", ResourceID: "x", Action: "update"})
	if !errors.Is(err, ErrVersionRequired) {
		t.Fatalf("error = %v, want ErrVersionRequired", err)
	}
	version := int32(2)
	_, err = registry.Execute(context.Background(), Principal{}, ActionRequest{Resource: "lead", ResourceID: "x", Action: "update", ExpectedVersion: &version})
	if !errors.Is(err, ErrConfirmationRequired) {
		t.Fatalf("error = %v, want ErrConfirmationRequired", err)
	}
}

func TestRegistryRejectsUnknownFilters(t *testing.T) {
	registry := New()
	err := registry.Register(fakeAdapter{definition: Definition{
		Name: "lead", Version: 1, MaxPageSize: 100,
		Filters: []FilterDefinition{{Name: "stage", Type: "string"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	_, err = registry.Query(context.Background(), Principal{}, QueryRequest{
		Resource: "lead", Filters: map[string]any{"secret": "x"}, Limit: 20,
	})
	if !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("error = %v, want ErrInvalidRequest", err)
	}
}
