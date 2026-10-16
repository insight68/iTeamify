package service

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestValidateBusinessContentPublishRequirements(t *testing.T) {
	issues := ValidateBusinessContent(EmptyBusinessContent(), true)
	wantPaths := map[string]bool{
		"business_name": false,
		"summary":       false,
		"positioning":   false,
		"offers":        false,
		"audiences":     false,
	}
	for _, issue := range issues {
		if _, ok := wantPaths[issue.Path]; ok {
			wantPaths[issue.Path] = true
		}
	}
	for path, found := range wantPaths {
		if !found {
			t.Fatalf("expected publish validation issue for %q, got %#v", path, issues)
		}
	}
}

func TestValidateBusinessContentReadyForPublish(t *testing.T) {
	content := BusinessContent{
		BusinessName: "Northstar Studio",
		Summary:      "An AI operating system for online service businesses.",
		Positioning:  "Turns business truth into coordinated agent action.",
		WebsiteURL:   "https://northstar.example",
		Offers: []BusinessOffer{{
			Name:    "Growth operating system",
			Summary: "A repeatable lead-to-delivery workflow.",
		}},
		Audiences: []BusinessAudience{{
			Name:         "Founder-led consultancies",
			CompanySizes: []string{"2-20 employees"},
		}},
	}
	if issues := ValidateBusinessContent(content, true); len(issues) != 0 {
		t.Fatalf("expected publish-ready content, got %#v", issues)
	}
}

func TestApplyBusinessOperationsReplacesOnlyAllowlistedTopLevelFields(t *testing.T) {
	content := BusinessContent{
		BusinessName: "Old name",
		BrandName:    "Old brand",
		Summary:      "Keep me",
		Offers:       []BusinessOffer{},
		Audiences:    []BusinessAudience{},
	}
	updated, err := applyBusinessOperations(content, []BusinessChangeOperation{
		{Op: "replace", Path: "/brand_name", Value: json.RawMessage(`"New brand"`)},
		{Op: "replace", Path: "/differentiators", Value: json.RawMessage(`["Agent-ready context"]`)},
	})
	if err != nil {
		t.Fatalf("applyBusinessOperations: %v", err)
	}
	if updated.BusinessName != "Old name" || updated.BrandName != "New brand" || updated.Summary != "Keep me" {
		t.Fatalf("unexpected patched content: %#v", updated)
	}
	if len(updated.Differentiators) != 1 || updated.Differentiators[0] != "Agent-ready context" {
		t.Fatalf("expected differentiator replacement, got %#v", updated.Differentiators)
	}
}

func TestApplyBusinessOperationsRejectsNestedOrUnknownPaths(t *testing.T) {
	for _, path := range []string{"/audiences/0/name", "/business_name", "/company_name"} {
		_, err := applyBusinessOperations(EmptyBusinessContent(), []BusinessChangeOperation{
			{Op: "replace", Path: path, Value: json.RawMessage(`"Injected"`)},
		})
		if !errors.Is(err, ErrBusinessProposalInvalid) {
			t.Fatalf("path %q: expected ErrBusinessProposalInvalid, got %v", path, err)
		}
	}
}

func TestApplyBusinessOperationsRejectsObjectForOffersWithActionableDetail(t *testing.T) {
	_, err := applyBusinessOperations(EmptyBusinessContent(), []BusinessChangeOperation{{
		Op: "add", Path: "/offers", Value: json.RawMessage(`{"name":"Procurement assistant"}`),
	}})
	if !errors.Is(err, ErrBusinessProposalInvalid) {
		t.Fatalf("expected ErrBusinessProposalInvalid, got %v", err)
	}
	var validationErr *BusinessOperationValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected BusinessOperationValidationError, got %T", err)
	}
	if validationErr.OperationIndex != 0 || validationErr.Field != "value" || validationErr.Path != "/offers" ||
		validationErr.Expected != "array of offer objects" || validationErr.Actual != "object" {
		t.Fatalf("unexpected validation detail: %#v", validationErr)
	}
	if !strings.Contains(err.Error(), "operations[0].value for /offers") {
		t.Fatalf("expected actionable error location, got %q", err.Error())
	}
}

func TestApplyBusinessOperationsAcceptsCompleteOffersArray(t *testing.T) {
	updated, err := applyBusinessOperations(EmptyBusinessContent(), []BusinessChangeOperation{{
		Op: "replace", Path: "/offers", Value: json.RawMessage(`[{"name":"Procurement assistant","summary":"Automates purchasing"}]`),
	}})
	if err != nil {
		t.Fatalf("applyBusinessOperations: %v", err)
	}
	if len(updated.Offers) != 1 || updated.Offers[0].Name != "Procurement assistant" || updated.Offers[0].ID == "" {
		t.Fatalf("unexpected offers: %#v", updated.Offers)
	}
}

func TestApplyBusinessOperationsRejectsUnknownCollectionFields(t *testing.T) {
	_, err := applyBusinessOperations(EmptyBusinessContent(), []BusinessChangeOperation{{
		Op: "replace", Path: "/offers", Value: json.RawMessage(`[{"name":"Procurement assistant","pricing":"1999"}]`),
	}})
	var validationErr *BusinessOperationValidationError
	if !errors.As(err, &validationErr) || !strings.Contains(validationErr.Detail, `unknown field "pricing"`) {
		t.Fatalf("expected unknown-field detail, got %v", err)
	}
}

func TestBusinessContentNormalizationAssignsStableNestedIDs(t *testing.T) {
	normalized := normalizeBusinessContent(BusinessContent{
		BrandName: " Public brand ",
		Offers:    []BusinessOffer{{Name: " Offer "}},
		Audiences: []BusinessAudience{{
			Name:          " Audience ",
			BuyerPersonas: []BusinessPersona{{Name: " Founder "}},
		}},
		Proof:   []BusinessProof{{Title: " Case study "}},
		Sources: []BusinessSource{{Title: " Homepage "}},
	})
	if normalized.Offers[0].ID == "" || normalized.Audiences[0].ID == "" ||
		normalized.Audiences[0].BuyerPersonas[0].ID == "" ||
		normalized.Proof[0].ID == "" || normalized.Sources[0].ID == "" {
		t.Fatalf("expected all nested records to receive IDs: %#v", normalized)
	}
	if normalized.Offers[0].Name != "Offer" || normalized.Audiences[0].BuyerPersonas[0].Name != "Founder" {
		t.Fatalf("expected normalized nested text: %#v", normalized)
	}
	if normalized.BrandName != "Public brand" {
		t.Fatalf("expected normalized brand name, got %q", normalized.BrandName)
	}
}

func TestBusinessContentNormalizationPreservesChartRelationships(t *testing.T) {
	normalized := normalizeBusinessContent(BusinessContent{
		Offers: []BusinessOffer{{Name: "Service", AudienceIDs: []string{" audience-1 ", ""}}},
		Audiences: []BusinessAudience{{
			ID: "audience-1", Name: "ICP", Priority: " core ",
			BuyerPersonas: []BusinessPersona{{Name: "Founder", BuyingRole: " decision_maker "}},
		}},
		Proof: []BusinessProof{{Title: "Case", OfferIDs: []string{" offer-1 ", ""}}},
	})
	if len(normalized.Offers[0].AudienceIDs) != 1 || normalized.Offers[0].AudienceIDs[0] != "audience-1" {
		t.Fatalf("unexpected audience relationships: %#v", normalized.Offers[0].AudienceIDs)
	}
	if normalized.Audiences[0].Priority != "core" || normalized.Audiences[0].BuyerPersonas[0].BuyingRole != "decision_maker" {
		t.Fatalf("unexpected market metadata: %#v", normalized.Audiences[0])
	}
	if len(normalized.Proof[0].OfferIDs) != 1 || normalized.Proof[0].OfferIDs[0] != "offer-1" {
		t.Fatalf("unexpected proof relationships: %#v", normalized.Proof[0].OfferIDs)
	}
}
