package daemon

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/pelletier/go-toml/v2"
)

// runtimeLocalMcpServerSummary is the intentionally non-secret inventory
// shown in Agent capabilities. Never add command arguments, URLs, headers, or
// environment values here: this payload leaves the user's machine.
type runtimeLocalMcpServerSummary struct {
	Name      string `json:"name"`
	Transport string `json:"transport,omitempty"`
	Source    string `json:"source,omitempty"`
	Enabled   bool   `json:"enabled"`
}

// providerSupportsFirstPartyMCP is intentionally aligned with the provider
// backends that consume ExecOptions.McpConfig (or, for Cursor/OpenClaw, their
// task-local execution-environment config). Providers outside this set keep
// their existing behavior and can still use the iTeamify CLI directly.
func providerSupportsFirstPartyMCP(provider string) bool {
	switch provider {
	case "claude", "codebuddy", "codex", "cursor", "opencode", "openclaw",
		"hermes", "kimi", "kiro", "qoder", "traecli", "grok", "qwen", "openagent":
		return true
	default:
		return false
	}
}

// injectiTeamifyMCPServer adds the daemon-owned task-scoped server after all
// user/runtime merging. The reserved name always wins so an agent-level MCP
// entry cannot replace the trusted command with an arbitrary process.
//
// Most providers let the MCP subprocess inherit the same ITEAMIFY_* task
// environment, so the default entry carries no credentials. Hermes is the
// exception: it deliberately filters the inherited environment of stdio MCP
// children. Its caller supplies the task-scoped values explicitly through
// injectiTeamifyMCPServerWithEnv, where they remain in the in-memory ACP request.
func injectiTeamifyMCPServer(provider string, raw json.RawMessage, executable string) (json.RawMessage, error) {
	return injectiTeamifyMCPServerWithEnv(provider, raw, executable, nil)
}

// injectiTeamifyMCPServerWithEnv is injectiTeamifyMCPServer with an optional,
// daemon-owned environment map for providers that filter stdio child-process
// environments. Callers must pass only task-scoped values; this function never
// reads or falls back to daemon credentials.
func injectiTeamifyMCPServerWithEnv(provider string, raw json.RawMessage, executable string, environment map[string]string) (json.RawMessage, error) {
	if !providerSupportsFirstPartyMCP(provider) {
		return raw, nil
	}
	executable = strings.TrimSpace(executable)
	if executable == "" || !filepath.IsAbs(executable) {
		return nil, fmt.Errorf("first-party MCP executable must be an absolute path")
	}

	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		// Once iTeamify injects a managed entry the provider's native inheritance
		// path may be replaced. Pull supported runtime-local servers into the
		// same task document first so the injection remains additive.
		merged, err := mergeRuntimeAndAgentMcpConfig(provider, json.RawMessage(`{"mcpServers":{}}`))
		if err != nil {
			return nil, err
		}
		raw = merged
		trimmed = bytes.TrimSpace(raw)
	}

	var document map[string]any
	if err := json.Unmarshal(trimmed, &document); err != nil {
		return nil, fmt.Errorf("parse MCP config for first-party injection: %w", err)
	}
	servers := map[string]any{}
	if configured, ok := nestedRuntimeMcpMap(document, "mcpServers"); ok {
		servers = configured
	} else if provider == "opencode" {
		// Normalize legacy native OpenCode input before adding the canonical
		// first-party entry. The OpenCode adapter translates this envelope.
		if configured, ok := nestedRuntimeMcpMap(document, "mcp"); ok {
			servers = configured
		}
	}
	// Preserve only the platform-owned restriction from an existing reserved
	// entry. The daemon still replaces command/args and never trusts auth env,
	// but dropping this allowlist would silently expand a managed profile to
	// the full first-party MCP catalog.
	if existing, ok := servers["iteamify"].(map[string]any); ok {
		if rawEnv, ok := existing["env"].(map[string]any); ok {
			if value, ok := rawEnv["ITEAMIFY_MCP_TOOL_ALLOWLIST"].(string); ok && strings.TrimSpace(value) != "" {
				if environment == nil {
					environment = map[string]string{}
				}
				environment["ITEAMIFY_MCP_TOOL_ALLOWLIST"] = value
			}
		} else if rawEnv, ok := existing["env"].(map[string]string); ok {
			if value := strings.TrimSpace(rawEnv["ITEAMIFY_MCP_TOOL_ALLOWLIST"]); value != "" {
				if environment == nil {
					environment = map[string]string{}
				}
				environment["ITEAMIFY_MCP_TOOL_ALLOWLIST"] = value
			}
		}
	}
	iteamify := map[string]any{
		"command": executable,
		"args":    []string{"mcp", "serve"},
	}
	if len(environment) > 0 {
		copied := make(map[string]string, len(environment))
		for key, value := range environment {
			copied[key] = value
		}
		iteamify["env"] = copied
	}
	servers["iteamify"] = iteamify

	injected, err := json.Marshal(map[string]any{"mcpServers": servers})
	if err != nil {
		return nil, fmt.Errorf("marshal first-party MCP config: %w", err)
	}
	return injected, nil
}

// mergeRuntimeAndAgentMcpConfig builds the task-local MCP configuration used
// when an agent has MCP servers managed by iTeamify. Runtime servers are the
// base layer and the agent's entries win on a same-name collision. The merge
// happens inside the local daemon so runtime URLs, headers, commands, and env
// values never need to leave the machine.
//
// A nil/null agent config keeps the provider's native inheritance path intact.
// A present config (including an empty mcpServers map) opts into the merged,
// task-local config so adding one managed server no longer disables unrelated
// runtime servers.
func mergeRuntimeAndAgentMcpConfig(provider string, agentConfig json.RawMessage) (json.RawMessage, error) {
	trimmed := bytes.TrimSpace(agentConfig)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return agentConfig, nil
	}

	runtimeServers, supported, err := loadRuntimeMcpServerConfigs(provider)
	if err != nil {
		return nil, err
	}
	if !supported {
		return agentConfig, nil
	}

	var agentDocument map[string]any
	if err := json.Unmarshal(trimmed, &agentDocument); err != nil {
		return nil, fmt.Errorf("parse agent MCP config: %w", err)
	}
	agentServers := map[string]any{}
	if servers, ok := nestedRuntimeMcpMap(agentDocument, "mcpServers"); ok {
		agentServers = servers
	} else if provider == "opencode" {
		// Older OpenCode agents may store the provider-native top-level `mcp`
		// map. Its individual entries can still flow through the existing
		// OpenCode adapter when placed under the canonical mcpServers envelope.
		if servers, ok := nestedRuntimeMcpMap(agentDocument, "mcp"); ok {
			agentServers = servers
		}
	}

	merged := make(map[string]any, len(runtimeServers)+len(agentServers))
	for name, entry := range runtimeServers {
		merged[name] = entry
	}
	for name, entry := range agentServers {
		merged[name] = entry
	}

	raw, err := json.Marshal(map[string]any{"mcpServers": merged})
	if err != nil {
		return nil, fmt.Errorf("marshal merged MCP config: %w", err)
	}
	return raw, nil
}

// loadRuntimeMcpServerConfigs returns full, secret-bearing runtime MCP entries
// for task-local merging. Callers must never send the result to the server or
// logs; the public capabilities endpoint continues to use the redacted summary
// type above.
func loadRuntimeMcpServerConfigs(provider string) (map[string]any, bool, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, false, fmt.Errorf("resolve user home: %w", err)
	}

	var path, key, format string
	switch provider {
	case "claude", "codebuddy":
		path, key, format = filepath.Join(home, ".claude.json"), "mcpServers", "json"
	case "codex":
		codexHome := strings.TrimSpace(os.Getenv("CODEX_HOME"))
		if codexHome == "" {
			codexHome = filepath.Join(home, ".codex")
		}
		path, key, format = filepath.Join(codexHome, "config.toml"), "mcp_servers", "toml"
	case "cursor":
		path, key, format = filepath.Join(home, ".cursor", "mcp.json"), "mcpServers", "json"
	case "opencode":
		configHome := strings.TrimSpace(os.Getenv("XDG_CONFIG_HOME"))
		if configHome == "" {
			configHome = filepath.Join(home, ".config")
		}
		path, key, format = filepath.Join(configHome, "opencode", "opencode.json"), "mcp", "json"
	case "openclaw":
		path = strings.TrimSpace(os.Getenv("CLAWDBOT_CONFIG_PATH"))
		if path == "" {
			stateDir := strings.TrimSpace(os.Getenv("OPENCLAW_STATE_DIR"))
			if stateDir == "" {
				stateDir = filepath.Join(home, ".openclaw")
			}
			path = filepath.Join(stateDir, "openclaw.json")
		}
		key, format = "mcp.servers", "json"
	default:
		return map[string]any{}, false, nil
	}

	servers := map[string]any{}
	raw, err := os.ReadFile(path)
	if err == nil {
		var cfg map[string]any
		if format == "toml" {
			if err := toml.Unmarshal(raw, &cfg); err != nil {
				return nil, true, fmt.Errorf("parse runtime MCP config: %w", err)
			}
		} else if err := json.Unmarshal(raw, &cfg); err != nil {
			return nil, true, fmt.Errorf("parse runtime MCP config: %w", err)
		}
		if configured, ok := nestedRuntimeMcpMap(cfg, key); ok {
			for name, entry := range configured {
				servers[name] = normalizeRuntimeMcpEntry(provider, entry)
			}
		}
	} else if !os.IsNotExist(err) {
		return nil, true, fmt.Errorf("read runtime MCP config: %w", err)
	}

	if provider == "claude" || provider == "codebuddy" {
		// User configuration has the same precedence Claude uses: plugin
		// servers only fill names not already defined by the user.
		for name, entry := range loadClaudePluginMcpServerConfigs(home) {
			if _, exists := servers[name]; !exists {
				servers[name] = entry
			}
		}
	}
	return servers, true, nil
}

func normalizeRuntimeMcpEntry(provider string, value any) any {
	entry, ok := value.(map[string]any)
	if !ok || provider != "codex" {
		return value
	}
	// iTeamify's canonical remote shape calls these `headers`; Codex stores
	// them as `http_headers`. Keep the original key as well so less common
	// Codex-specific settings round-trip through renderCodexMcpServersBlock.
	if headers, ok := entry["http_headers"]; ok {
		if _, exists := entry["headers"]; !exists {
			entry["headers"] = headers
		}
	}
	if _, hasURL := entry["url"]; hasURL {
		if _, hasType := entry["type"]; !hasType {
			entry["type"] = "http"
		}
	}
	return entry
}

func loadClaudePluginMcpServerConfigs(home string) map[string]any {
	out := map[string]any{}
	for _, plugin := range listEnabledClaudePlugins(home) {
		manifest, _ := readClaudePluginManifest(plugin.InstallPath)
		paths := claudePluginComponentPaths(
			plugin.InstallPath,
			manifest.MCPServers,
			filepath.Join(plugin.InstallPath, ".mcp.json"),
		)
		for _, path := range paths {
			raw, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			var cfg map[string]any
			if json.Unmarshal(raw, &cfg) != nil {
				continue
			}
			servers, ok := nestedRuntimeMcpMap(cfg, "mcpServers")
			if !ok {
				continue
			}
			for name, entry := range servers {
				if _, exists := out[name]; !exists {
					out[name] = entry
				}
			}
		}
	}
	return out
}

func listRuntimeLocalMcpServers(provider string) ([]runtimeLocalMcpServerSummary, bool, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, false, fmt.Errorf("resolve user home: %w", err)
	}

	var path, key, source string
	var format string
	switch provider {
	case "claude", "codebuddy":
		path, key, source, format = filepath.Join(home, ".claude.json"), "mcpServers", "User config", "json"
	case "codex":
		codexHome := strings.TrimSpace(os.Getenv("CODEX_HOME"))
		if codexHome == "" {
			codexHome = filepath.Join(home, ".codex")
		}
		path, key, source, format = filepath.Join(codexHome, "config.toml"), "mcp_servers", "User config", "toml"
	case "cursor":
		path, key, source, format = filepath.Join(home, ".cursor", "mcp.json"), "mcpServers", "User config", "json"
	case "opencode":
		configHome := strings.TrimSpace(os.Getenv("XDG_CONFIG_HOME"))
		if configHome == "" {
			configHome = filepath.Join(home, ".config")
		}
		path, key, source, format = filepath.Join(configHome, "opencode", "opencode.json"), "mcp", "User config", "json"
	case "openclaw":
		path = strings.TrimSpace(os.Getenv("CLAWDBOT_CONFIG_PATH"))
		if path == "" {
			stateDir := strings.TrimSpace(os.Getenv("OPENCLAW_STATE_DIR"))
			if stateDir == "" {
				stateDir = filepath.Join(home, ".openclaw")
			}
			path = filepath.Join(stateDir, "openclaw.json")
		}
		key, source, format = "mcp.servers", "User config", "json"
	default:
		return []runtimeLocalMcpServerSummary{}, false, nil
	}

	out := make([]runtimeLocalMcpServerSummary, 0)
	raw, err := os.ReadFile(path)
	if err == nil {
		var cfg map[string]any
		if format == "toml" {
			if err := toml.Unmarshal(raw, &cfg); err != nil {
				return nil, true, fmt.Errorf("parse runtime MCP config: %w", err)
			}
		} else if err := json.Unmarshal(raw, &cfg); err != nil {
			return nil, true, fmt.Errorf("parse runtime MCP config: %w", err)
		}
		if servers, ok := nestedRuntimeMcpMap(cfg, key); ok {
			out = append(out, runtimeMcpSummaries(servers, source)...)
		}
	} else if !os.IsNotExist(err) {
		return nil, true, fmt.Errorf("read runtime MCP config: %w", err)
	}

	if provider == "claude" || provider == "codebuddy" {
		out = append(out, listClaudePluginMcpServers(home)...)
	}

	// User configuration wins on a same-name collision. Plugin entries are
	// appended afterwards and only fill names the user config did not define.
	deduped := make([]runtimeLocalMcpServerSummary, 0, len(out))
	seen := make(map[string]bool)
	for _, server := range out {
		if seen[server.Name] {
			continue
		}
		seen[server.Name] = true
		deduped = append(deduped, server)
	}
	out = deduped
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out, true, nil
}

func runtimeMcpSummaries(servers map[string]any, source string) []runtimeLocalMcpServerSummary {
	out := make([]runtimeLocalMcpServerSummary, 0, len(servers))
	for name, value := range servers {
		entry, ok := value.(map[string]any)
		if !ok || strings.TrimSpace(name) == "" {
			continue
		}
		enabled := true
		if value, ok := entry["enabled"].(bool); ok {
			enabled = value
		}
		if value, ok := entry["disabled"].(bool); ok && value {
			enabled = false
		}
		out = append(out, runtimeLocalMcpServerSummary{
			Name:      name,
			Transport: runtimeMcpTransport(entry),
			Source:    source,
			Enabled:   enabled,
		})
	}
	return out
}

func listClaudePluginMcpServers(home string) []runtimeLocalMcpServerSummary {
	out := make([]runtimeLocalMcpServerSummary, 0)
	for _, plugin := range listEnabledClaudePlugins(home) {
		manifest, _ := readClaudePluginManifest(plugin.InstallPath)
		paths := claudePluginComponentPaths(
			plugin.InstallPath,
			manifest.MCPServers,
			filepath.Join(plugin.InstallPath, ".mcp.json"),
		)
		for _, path := range paths {
			raw, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			var cfg map[string]any
			if json.Unmarshal(raw, &cfg) != nil {
				continue
			}
			servers, ok := nestedRuntimeMcpMap(cfg, "mcpServers")
			if !ok {
				continue
			}
			out = append(out, runtimeMcpSummaries(servers, "Claude Plugin · "+plugin.Name)...)
		}
	}
	return out
}

func nestedRuntimeMcpMap(cfg map[string]any, path string) (map[string]any, bool) {
	current := cfg
	parts := strings.Split(path, ".")
	for index, part := range parts {
		value, exists := current[part]
		if !exists {
			return nil, false
		}
		mapped, ok := value.(map[string]any)
		if !ok {
			return nil, false
		}
		if index == len(parts)-1 {
			return mapped, true
		}
		current = mapped
	}
	return nil, false
}

func runtimeMcpTransport(entry map[string]any) string {
	kind, _ := entry["type"].(string)
	switch strings.ToLower(kind) {
	case "local", "stdio":
		return "stdio"
	case "remote", "http", "streamable-http":
		return "http"
	case "sse":
		return "sse"
	}
	if _, ok := entry["command"]; ok {
		return "stdio"
	}
	if _, ok := entry["url"]; ok {
		return "http"
	}
	return "unknown"
}
