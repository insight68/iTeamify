package agentcontext

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUserContextIsScopedToWorkingDirectory(t *testing.T) {
	first := t.TempDir()
	second := t.TempDir()
	if err := os.WriteFile(filepath.Join(first, "CLAUDE.md"), []byte("workspace-alpha"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(second, "CLAUDE.md"), []byte("workspace-beta"), 0o600); err != nil {
		t.Fatal(err)
	}

	firstContext := GetUserContext(first)
	secondContext := GetUserContext(second)
	if !strings.Contains(firstContext.ProjectMD, "workspace-alpha") || strings.Contains(firstContext.ProjectMD, "workspace-beta") {
		t.Fatalf("first context leaked: %q", firstContext.ProjectMD)
	}
	if !strings.Contains(secondContext.ProjectMD, "workspace-beta") || strings.Contains(secondContext.ProjectMD, "workspace-alpha") {
		t.Fatalf("second context leaked: %q", secondContext.ProjectMD)
	}
}
