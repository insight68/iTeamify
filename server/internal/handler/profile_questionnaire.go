package handler

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"
)

// Validate only supplied fields so separate profile/source edits merge safely.
func validateQuestionnairePatch(raw json.RawMessage) ([]byte, error) {
	if len(raw) > patchOnboardingBodyLimit {
		return nil, fmt.Errorf("questionnaire is too large")
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		return nil, fmt.Errorf("questionnaire must be an object")
	}
	result := make(map[string]any, len(fields))
	validRole := "engineer product designer founder marketing writer research ops student other"
	validSource := "friends_colleagues search social_x social_linkedin social_youtube social_github social_other blog_newsletter ai_assistant from_work event_conference dont_remember other"
	validUseCase := "ship_code manage_team personal_tasks plan_research write_publish automate_ops evaluate other"
	contains := func(values, value string) bool { return strings.Contains(" "+values+" ", " "+value+" ") }
	for key, value := range fields {
		invalid := func() ([]byte, error) { return nil, fmt.Errorf("invalid questionnaire field: %s", key) }
		switch key {
		case "role", "role_other", "use_case_other", "source_other":
			if string(value) == "null" {
				result[key] = nil
				continue
			}
			var text string
			if json.Unmarshal(value, &text) != nil {
				return invalid()
			}
			text = strings.TrimSpace(text)
			if utf8.RuneCountInString(text) > MaxProfileDescriptionLen {
				return invalid()
			}
			if key == "role" && text != "" && !contains(validRole, text) {
				return invalid()
			}
			result[key] = text
		case "source", "use_case":
			var values stringOrSlice
			if json.Unmarshal(value, &values) != nil {
				return invalid()
			}
			allowed := validUseCase
			if key == "source" {
				allowed = validSource
			}
			unique := []string{}
			seen := map[string]bool{}
			for _, item := range values {
				if item == "" || !contains(allowed, item) {
					return invalid()
				}
				if !seen[item] {
					unique = append(unique, item)
					seen[item] = true
				}
			}
			result[key] = unique
		case "source_skipped", "role_skipped", "use_case_skipped":
			var flag bool
			if string(value) == "null" || json.Unmarshal(value, &flag) != nil {
				return invalid()
			}
			result[key] = flag
		case "version":
			var version int
			if json.Unmarshal(value, &version) != nil || version != questionnaireSchemaVersion {
				return invalid()
			}
			result[key] = version
		default:
			return invalid()
		}
	}
	if len(result) > 0 {
		result["version"] = questionnaireSchemaVersion
	}
	return json.Marshal(result)
}
