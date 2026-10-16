package agent

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/codeany-ai/open-agent-sdk-go/types"
	"github.com/google/uuid"
)

const (
	openAgentSessionVersion  = 1
	openAgentSessionMaxBytes = 64 << 20
)

var errOpenAgentResumeRejected = errors.New("openagent session cannot be resumed")

type openAgentSessionSnapshot struct {
	Version   int             `json:"version"`
	SessionID string          `json:"session_id"`
	CWD       string          `json:"cwd"`
	Messages  []types.Message `json:"messages"`
}

type openAgentSessionStore struct {
	cwd string
	dir string
}

func newOpenAgentSessionStore(cwd string) (*openAgentSessionStore, error) {
	cwd = strings.TrimSpace(cwd)
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			return nil, err
		}
	}
	abs, err := filepath.Abs(cwd)
	if err != nil {
		return nil, err
	}
	abs = filepath.Clean(abs)
	if info, err := os.Stat(abs); err != nil {
		return nil, err
	} else if !info.IsDir() {
		return nil, fmt.Errorf("working directory is not a directory")
	}

	dir := abs
	for index, component := range []string{".iteamify", "openagent", "sessions"} {
		dir = filepath.Join(dir, component)
		if err := ensureOpenAgentSessionDirectory(dir, index > 0); err != nil {
			return nil, err
		}
	}
	return &openAgentSessionStore{cwd: abs, dir: dir}, nil
}

func ensureOpenAgentSessionDirectory(path string, requirePrivate bool) error {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return os.Mkdir(path, 0o700)
	}
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return fmt.Errorf("session path %q is not a private directory", path)
	}
	if requirePrivate && info.Mode().Perm()&0o077 != 0 {
		return fmt.Errorf("session path %q grants group or other access", path)
	}
	return nil
}

func (s *openAgentSessionStore) load(sessionID string) (openAgentSessionSnapshot, error) {
	path, err := s.path(sessionID)
	if err != nil {
		return openAgentSessionSnapshot{}, err
	}
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return openAgentSessionSnapshot{}, fmt.Errorf("%w: session %s was not found in this working directory", errOpenAgentResumeRejected, sessionID)
	}
	if err != nil {
		return openAgentSessionSnapshot{}, err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return openAgentSessionSnapshot{}, fmt.Errorf("%w: session file is not regular", errOpenAgentResumeRejected)
	}
	if info.Size() > openAgentSessionMaxBytes {
		return openAgentSessionSnapshot{}, fmt.Errorf("%w: session exceeds size limit", errOpenAgentResumeRejected)
	}

	file, err := os.Open(path)
	if err != nil {
		return openAgentSessionSnapshot{}, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, openAgentSessionMaxBytes+1))
	if err != nil {
		return openAgentSessionSnapshot{}, err
	}
	if len(data) > openAgentSessionMaxBytes {
		return openAgentSessionSnapshot{}, fmt.Errorf("%w: session exceeds size limit", errOpenAgentResumeRejected)
	}

	var snapshot openAgentSessionSnapshot
	if err := json.Unmarshal(data, &snapshot); err != nil {
		return openAgentSessionSnapshot{}, fmt.Errorf("%w: malformed session", errOpenAgentResumeRejected)
	}
	if snapshot.Version != openAgentSessionVersion || snapshot.SessionID != sessionID ||
		filepath.Clean(snapshot.CWD) != s.cwd || len(snapshot.Messages) == 0 {
		return openAgentSessionSnapshot{}, fmt.Errorf("%w: session provenance mismatch", errOpenAgentResumeRejected)
	}
	return snapshot, nil
}

func (s *openAgentSessionStore) save(snapshot openAgentSessionSnapshot) error {
	path, err := s.path(snapshot.SessionID)
	if err != nil {
		return err
	}
	if snapshot.Version != openAgentSessionVersion || filepath.Clean(snapshot.CWD) != s.cwd || len(snapshot.Messages) == 0 {
		return fmt.Errorf("invalid session snapshot")
	}
	data, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	if len(data) > openAgentSessionMaxBytes {
		return fmt.Errorf("session exceeds size limit")
	}

	tmp, err := os.CreateTemp(s.dir, ".session-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	removeTemp := true
	defer func() {
		_ = tmp.Close()
		if removeTemp {
			_ = os.Remove(tmpPath)
		}
	}()
	if err := tmp.Chmod(0o600); err != nil {
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		return err
	}
	if err := tmp.Sync(); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return err
	}
	removeTemp = false
	directory, err := os.Open(s.dir)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

func (s *openAgentSessionStore) path(sessionID string) (string, error) {
	parsed, err := uuid.Parse(sessionID)
	if err != nil || parsed.String() != strings.ToLower(sessionID) {
		return "", fmt.Errorf("%w: invalid session id", errOpenAgentResumeRejected)
	}
	return filepath.Join(s.dir, parsed.String()+".json"), nil
}

func isOpenAgentResumeRejected(err error) bool {
	return errors.Is(err, errOpenAgentResumeRejected)
}

func completedSession(result Result) *Session {
	messages := make(chan Message)
	results := make(chan Result, 1)
	close(messages)
	results <- result
	close(results)
	return &Session{Messages: messages, Result: results}
}
