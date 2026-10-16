package daemon

import (
	"errors"
	"github.com/iteamify-ai/iteamify/server/internal/openagentendpoint"
	"strings"
)

func validateOpenAgentRuntimeConfig(config *OpenAgentRuntimeConfig) error {
	if config == nil || config.Provider != "anthropic" || strings.TrimSpace(config.Model) == "" || strings.TrimSpace(config.APIKey) == "" {
		return errors.New("workspace OpenAgent configuration is incomplete")
	}
	base, err := openagentendpoint.NormalizeBaseURL(config.BaseURL)
	if err != nil {
		return err
	}
	if strings.ContainsAny(config.Model+config.APIKey, "\r\n") {
		return errors.New("OpenAgent model and credential must be one line")
	}
	config.BaseURL = base
	config.Model = strings.TrimSpace(config.Model)
	return nil
}
