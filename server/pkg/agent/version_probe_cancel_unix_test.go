//go:build unix

package agent

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// A timed-out metadata probe must terminate the whole CLI process group. Some
// CLIs spawn update-check grandchildren (Hermes launches git fetch); killing
// only the wrapper leaves those processes running under PID 1 after every
// daemon restart.
func TestDetectVersionTimeoutTerminatesGrandchild(t *testing.T) {
	dir := t.TempDir()
	pidFile := filepath.Join(dir, "pids")
	script := filepath.Join(dir, "agent-version")
	body := fmt.Sprintf(`#!/bin/sh
( trap '' TERM; sleep 300 ) </dev/null >/dev/null 2>&1 &
child=$!
printf '%%s %%s\n' "$$" "$child" > %q
wait
`, pidFile)
	writeTestExecutable(t, script, []byte(body))

	orig := detectVersionTimeout
	detectVersionTimeout = 2 * time.Second
	t.Cleanup(func() { detectVersionTimeout = orig })

	_, probeErr := DetectVersion(context.Background(), script)
	if probeErr == nil {
		t.Fatal("DetectVersion returned nil error for a hanging probe")
	}

	data, err := waitForFile(pidFile, 2*time.Second)
	if err != nil {
		t.Fatalf("read pid file after probe failed with %v: %v", probeErr, err)
	}
	for _, field := range strings.Fields(string(data)) {
		pid, err := strconv.Atoi(field)
		if err != nil {
			t.Fatalf("parse pid %q: %v", field, err)
		}
		waitProcessGone(t, pid)
	}
}

func waitForFile(path string, timeout time.Duration) ([]byte, error) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if data, err := os.ReadFile(path); err == nil && len(data) > 0 {
			return data, nil
		}
		time.Sleep(10 * time.Millisecond)
	}
	return nil, fmt.Errorf("timed out waiting for %s", path)
}
