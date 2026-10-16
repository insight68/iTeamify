package agent

import "testing"

func TestIsSystemRuntimeProvider(t *testing.T) {
	if !IsSystemRuntimeProvider(" OpenAgent ") {
		t.Fatal("reserved OpenAgent provider was not recognized")
	}
	if IsSystemRuntimeProvider("claude") {
		t.Fatal("ordinary provider was recognized as a system runtime")
	}
}
