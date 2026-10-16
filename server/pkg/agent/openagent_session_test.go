package agent

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/codeany-ai/open-agent-sdk-go/types"
	"github.com/google/uuid"
)

func TestOpenAgentSessionStoreIsScopedToWorkdir(t *testing.T) {
	first, err := newOpenAgentSessionStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	second, err := newOpenAgentSessionStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	sessionID := uuid.NewString()
	snapshot := openAgentSessionSnapshot{
		Version:   openAgentSessionVersion,
		SessionID: sessionID,
		CWD:       first.cwd,
		Messages: []types.Message{{
			Type: types.MessageTypeUser, Role: "user", UUID: "message-1",
			Content: []types.ContentBlock{{Type: types.ContentBlockText, Text: "workspace alpha"}},
		}},
	}
	if err := first.save(snapshot); err != nil {
		t.Fatal(err)
	}
	loaded, err := first.load(sessionID)
	if err != nil {
		t.Fatal(err)
	}
	if got := types.ExtractText(&loaded.Messages[0]); got != "workspace alpha" {
		t.Fatalf("loaded message = %q", got)
	}
	if _, err := second.load(sessionID); !errors.Is(err, errOpenAgentResumeRejected) {
		t.Fatalf("cross-workdir resume error = %v", err)
	}
}

func TestOpenAgentSessionStoreRejectsPathLikeSessionID(t *testing.T) {
	store, err := newOpenAgentSessionStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.load("../../other-workspace"); !errors.Is(err, errOpenAgentResumeRejected) {
		t.Fatalf("path-like session id error = %v", err)
	}
}

func TestOpenAgentSessionStoreRejectsPublicRuntimeDirectory(t *testing.T) {
	cwd := t.TempDir()
	openAgentDir := filepath.Join(cwd, ".iteamify", "openagent")
	if err := os.MkdirAll(openAgentDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(openAgentDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := newOpenAgentSessionStore(cwd); err == nil {
		t.Fatal("public OpenAgent runtime directory was accepted")
	}
}
