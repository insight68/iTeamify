package service

import (
	"errors"
	"testing"
)

func TestContractReviewTransitionsRespectParticipantAndState(t *testing.T) {
	for _, tc := range []struct {
		status, action string
		requester      bool
		want           string
	}{
		{"submitted", "accept", false, "accepted"}, {"accepted", "start", false, "in_review"}, {"in_review", "complete", false, "completed"},
		{"in_review", "request_info", false, "needs_info"}, {"needs_info", "supplement", true, "submitted"},
		{"submitted", "complete", false, ""}, {"submitted", "accept", true, ""}, {"completed", "start", false, ""}, {"needs_info", "supplement", false, ""},
	} {
		got, err := ContractReviewTransition(tc.status, tc.action, tc.requester)
		if got != tc.want || (tc.want == "" && !errors.Is(err, ErrContractForbidden)) || (tc.want != "" && err != nil) {
			t.Fatalf("%+v: got %s, %v", tc, got, err)
		}
	}
}

func TestContractReviewRejectsInvalidFieldsAndFiles(t *testing.T) {
	f := ContractReviewFields{Title: "Review", Priority: "normal", Deadline: "2026-10-20", OpportunityStage: "negotiating"}
	if err := f.Validate(); err != nil {
		t.Fatal(err)
	}
	f.Deadline = "2026-02-30"
	if !errors.Is(f.Validate(), ErrContractInput) {
		t.Fatal("invalid date accepted")
	}
	if !errors.Is(validateContractFiles([]ContractFileInput{{Filename: "contract.html", Data: []byte("<script>")}}), ErrContractInput) {
		t.Fatal("active content accepted")
	}
}

func TestConfiguredContractRequirements(t *testing.T) {
	rules := ContractApplicationConfig{ServiceName: "Legal", DefaultPriority: "normal", ContractTypes: []string{"Procurement"}, RequireBackground: true, RequireFocus: true}
	f := ContractReviewFields{Title: "Review", ContractType: "Procurement", Priority: "normal"}
	if !errors.Is(rules.ValidateFields(f), ErrContractInput) {
		t.Fatal("required fields bypassed")
	}
	f.Background = "Business context"
	f.Focus = "Payment deadlines"
	if err := rules.ValidateFields(f); err != nil {
		t.Fatal(err)
	}
	f.ContractType = "Employment"
	if !errors.Is(rules.ValidateFields(f), ErrContractInput) {
		t.Fatal("out-of-scope contract accepted")
	}
	rules.ContractTypes = []string{"Procurement", "Procurement"}
	if !errors.Is(rules.Validate(), ErrContractInput) {
		t.Fatal("ambiguous duplicate type accepted")
	}
}
