package siteconfig

import (
	"bytes"
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestOpenAgentWorkspaceCredentialsStayOnBackend(t *testing.T) {
	dir := t.TempDir()
	if err := os.Chmod(dir, 0700); err != nil {
		t.Fatal(err)
	}
	token := strings.Repeat("d", 40)
	key := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7}, 32))
	for name, value := range map[string]string{ManagedDaemonTokenCredential: token, OpenAgentSecretKeyCredential: key} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(value), 0600); err != nil {
			t.Fatal(err)
		}
	}
	artifacts, err := Compile(Config{Version: CurrentSchemaVersion, OpenAgent: OpenAgentConfig{Enabled: true, DaemonID: "00000000-0000-4000-8000-000000000001"}}, dir)
	if err != nil {
		t.Fatal(err)
	}
	backend := string(artifacts.EnvironmentFiles[ManagedBackendEnvironmentFile])
	daemon := string(artifacts.EnvironmentFiles[ManagedDaemonEnvironmentFile])
	if !strings.Contains(backend, "ITEAMIFY_OPENAGENT_SECRET_KEY="+key) || strings.Contains(daemon, key) || strings.Contains(string(artifacts.Metadata), key) {
		t.Fatal("workspace encryption boundary drifted")
	}
	for _, retired := range []string{"PROVISIONING", "PLATFORM_ADMIN", "MCP_SECRET", "ANTHROPIC_", "OPENAGENT_API_KEY", "OPENAGENT_BASE_URL", "OPENAGENT_MODEL"} {
		if strings.Contains(backend+daemon, retired) {
			t.Fatalf("retired setting %s", retired)
		}
	}
}
func TestDisabledOpenAgentDoesNotReadCredentials(t *testing.T) {
	if _, err := Compile(Config{Version: CurrentSchemaVersion}, filepath.Join(t.TempDir(), "missing")); err != nil {
		t.Fatal(err)
	}
}
func TestOpenAgentConfigRejectsTemplateControlPlane(t *testing.T) {
	p := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(p, []byte("version: 5\nmanaged_workspace:\n  enabled: false\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(p); err == nil {
		t.Fatal("removed configuration accepted")
	}
}
