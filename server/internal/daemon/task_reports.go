package daemon

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/iteamify-ai/iteamify/server/pkg/agent"
)

const taskReportMaxBytes = 64 << 20

var errTaskReportPersistence = errors.New("task report persistence failed")

type pendingTaskSession struct {
	SessionID string `json:"session_id"`
	WorkDir   string `json:"work_dir"`
}

type pendingTaskTerminal struct {
	Kind                  terminalTaskReportKind `json:"kind"`
	Output                string                 `json:"output,omitempty"`
	BranchName            string                 `json:"branch_name,omitempty"`
	Error                 string                 `json:"error,omitempty"`
	SessionID             string                 `json:"session_id,omitempty"`
	WorkDir               string                 `json:"work_dir,omitempty"`
	FailureReason         string                 `json:"failure_reason,omitempty"`
	SessionRolloutMissing bool                   `json:"session_rollout_missing,omitempty"`
}

type pendingTaskReport struct {
	Version   int                  `json:"version"`
	TaskID    string               `json:"task_id"`
	RuntimeID string               `json:"runtime_id"`
	WorkDir   string               `json:"work_dir,omitempty"`
	Session   *pendingTaskSession  `json:"session,omitempty"`
	Messages  []TaskMessageData    `json:"messages,omitempty"`
	Usage     []TaskUsageEntry     `json:"usage,omitempty"`
	Terminal  *pendingTaskTerminal `json:"terminal,omitempty"`
}

// taskReportStore journals delivery receipts, never executable prompts. A
// process restart can resend these records without running business tools.
// Mutations are serialized only for local disk I/O; each task has a separate
// delivery lock so an unavailable server does not block unrelated tasks.
type taskReportStore struct {
	dir      string
	mu       sync.Mutex
	records  map[string]pendingTaskReport
	active   map[string]bool
	delivery map[string]*taskReportDelivery
}

type taskReportDelivery struct {
	mu         sync.Mutex
	references int
}

func openTaskReportStore(root, serverURL, daemonID string) (*taskReportStore, error) {
	scope := sha256.Sum256([]byte(strings.TrimRight(serverURL, "/") + "\n" + daemonID))
	dir := filepath.Join(root, ".task-reports")
	for _, path := range []string{dir, filepath.Join(dir, hex.EncodeToString(scope[:16]))} {
		info, err := os.Lstat(path)
		if errors.Is(err, os.ErrNotExist) {
			if err := os.Mkdir(path, 0o700); err != nil {
				return nil, err
			}
		} else if err != nil {
			return nil, err
		} else if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 || info.Mode().Perm()&0o077 != 0 {
			return nil, fmt.Errorf("task report path is not a private directory: %s", path)
		}
		dir = path
	}
	s := &taskReportStore{dir: dir, records: make(map[string]pendingTaskReport), active: make(map[string]bool), delivery: make(map[string]*taskReportDelivery)}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".json")
		if parsed, err := uuid.Parse(id); err != nil || parsed.String() != id {
			return nil, fmt.Errorf("invalid task report identity: %s", entry.Name())
		}
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}
		if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 || info.Size() > taskReportMaxBytes {
			return nil, fmt.Errorf("invalid task report file: %s", entry.Name())
		}
		file, err := os.Open(filepath.Join(dir, entry.Name()))
		if err != nil {
			return nil, err
		}
		data, readErr := io.ReadAll(io.LimitReader(file, taskReportMaxBytes+1))
		_ = file.Close()
		if readErr != nil {
			return nil, readErr
		}
		var record pendingTaskReport
		if len(data) > taskReportMaxBytes || json.Unmarshal(data, &record) != nil || record.Version != 1 || record.TaskID != id {
			return nil, fmt.Errorf("malformed task report: %s", entry.Name())
		}
		s.records[id] = record
	}
	return s, nil
}

func (s *taskReportStore) save(record pendingTaskReport) error {
	data, err := json.Marshal(record)
	if err != nil {
		return err
	}
	if len(data) > taskReportMaxBytes {
		return fmt.Errorf("task report exceeds size limit")
	}
	file, err := os.CreateTemp(s.dir, ".report-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if err := file.Chmod(0o600); err != nil {
		return err
	}
	if _, err := file.Write(data); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(file.Name(), filepath.Join(s.dir, record.TaskID+".json")); err != nil {
		return err
	}
	return syncTaskReportDirectory(s.dir)
}

func syncTaskReportDirectory(dir string) error {
	file, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer file.Close()
	return file.Sync()
}

func (s *taskReportStore) update(taskID string, change func(*pendingTaskReport)) error {
	parsed, err := uuid.Parse(taskID)
	if err != nil || parsed.String() != taskID {
		return fmt.Errorf("invalid task report identity")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	record, exists := s.records[taskID]
	if !exists {
		record = pendingTaskReport{Version: 1, TaskID: taskID}
	}
	// Callers replace slices and pointers instead of mutating shared storage.
	change(&record)
	if err := s.save(record); err != nil {
		return err
	}
	s.records[taskID] = record
	return nil
}

func (s *taskReportStore) begin(taskID, runtimeID string) error {
	if err := s.update(taskID, func(r *pendingTaskReport) { r.RuntimeID = runtimeID }); err != nil {
		return err
	}
	s.mu.Lock()
	s.active[taskID] = true
	s.mu.Unlock()
	return nil
}

func (s *taskReportStore) release(taskID string) {
	s.mu.Lock()
	delete(s.active, taskID)
	s.mu.Unlock()
}

func (s *taskReportStore) read(taskID string) (pendingTaskReport, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.records[taskID]
	return r, ok
}

func (s *taskReportStore) lockDelivery(taskID string) func() {
	s.mu.Lock()
	entry := s.delivery[taskID]
	if entry == nil {
		entry = new(taskReportDelivery)
		s.delivery[taskID] = entry
	}
	entry.references++
	s.mu.Unlock()
	entry.mu.Lock()
	return func() {
		entry.mu.Unlock()
		s.mu.Lock()
		entry.references--
		if entry.references == 0 {
			delete(s.delivery, taskID)
		}
		s.mu.Unlock()
	}
}

func (s *taskReportStore) removeIfEmpty(taskID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, exists := s.records[taskID]
	if !exists || s.active[taskID] || r.Session != nil || len(r.Messages) > 0 || len(r.Usage) > 0 || r.Terminal != nil {
		return nil
	}
	if err := os.Remove(filepath.Join(s.dir, taskID+".json")); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := syncTaskReportDirectory(s.dir); err != nil {
		return err
	}
	delete(s.records, taskID)
	return nil
}

func (s *taskReportStore) pendingTasks() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	ids := make([]string, 0, len(s.records))
	for id, record := range s.records {
		if !s.active[id] || record.Session != nil || len(record.Messages) > 0 || len(record.Usage) > 0 || record.Terminal != nil {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids
}

func (d *Daemon) pendingTerminalTaskIDs(runtimeID string) []string {
	if d.taskReports == nil {
		return nil
	}
	d.taskReports.mu.Lock()
	defer d.taskReports.mu.Unlock()
	var ids []string
	for id, record := range d.taskReports.records {
		if record.RuntimeID == runtimeID && record.Terminal != nil {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids
}

func (d *Daemon) reportTaskMessages(ctx context.Context, taskID string, messages []TaskMessageData) error {
	if d.taskReports == nil {
		return d.client.ReportTaskMessages(ctx, taskID, messages)
	}
	if err := d.taskReports.update(taskID, func(r *pendingTaskReport) {
		r.Messages = append(append([]TaskMessageData(nil), r.Messages...), messages...)
	}); err != nil {
		return fmt.Errorf("%w: %w", errTaskReportPersistence, err)
	}
	return d.deliverTaskReport(ctx, taskID)
}

func (d *Daemon) reportTaskSession(ctx context.Context, taskID, sessionID, workDir string) error {
	if d.taskReports == nil {
		return d.client.PinTaskSession(ctx, taskID, sessionID, workDir)
	}
	if err := d.taskReports.update(taskID, func(r *pendingTaskReport) {
		r.Session = &pendingTaskSession{SessionID: sessionID, WorkDir: workDir}
		r.WorkDir = workDir
	}); err != nil {
		return fmt.Errorf("persist task session: %w", err)
	}
	return d.deliverTaskReport(ctx, taskID)
}

func (d *Daemon) reportTaskUsage(ctx context.Context, taskID string, usage []TaskUsageEntry) error {
	if d.taskReports == nil {
		return d.client.ReportTaskUsage(ctx, taskID, usage)
	}
	if err := d.taskReports.update(taskID, func(r *pendingTaskReport) { r.Usage = append([]TaskUsageEntry(nil), usage...) }); err != nil {
		return fmt.Errorf("persist task usage: %w", err)
	}
	return d.deliverTaskReport(ctx, taskID)
}

// deliverTaskReport sends a snapshot in transcript -> usage -> terminal order.
// Acknowledgements remove only that snapshot, preserving concurrently appended
// messages. Server message sequences and cumulative usage make replay safe.
func (d *Daemon) deliverTaskReport(ctx context.Context, taskID string) error {
	store := d.taskReports
	unlock := store.lockDelivery(taskID)
	defer unlock()
	record, ok := store.read(taskID)
	if !ok {
		return nil
	}
	if record.Session != nil {
		if err := d.client.PinTaskSession(ctx, taskID, record.Session.SessionID, record.Session.WorkDir); err != nil {
			return err
		}
		if err := store.update(taskID, func(r *pendingTaskReport) {
			if r.Session == record.Session {
				r.Session = nil
			}
		}); err != nil {
			return err
		}
	}
	if len(record.Messages) > 0 {
		if err := d.client.ReportTaskMessages(ctx, taskID, record.Messages); err != nil {
			return err
		}
		acknowledged := make(map[int]bool, len(record.Messages))
		for _, msg := range record.Messages {
			acknowledged[msg.Seq] = true
		}
		if err := store.update(taskID, func(r *pendingTaskReport) {
			remaining := make([]TaskMessageData, 0, len(r.Messages))
			for _, msg := range r.Messages {
				if !acknowledged[msg.Seq] {
					remaining = append(remaining, msg)
				}
			}
			r.Messages = remaining
		}); err != nil {
			return err
		}
	}
	if len(record.Usage) > 0 {
		if err := d.client.postJSON(ctx, fmt.Sprintf("/api/daemon/tasks/%s/usage", taskID), map[string]any{"usage": record.Usage}, nil); err != nil {
			return err
		}
		if err := store.update(taskID, func(r *pendingTaskReport) {
			if sameTaskReportUsage(r.Usage, record.Usage) {
				r.Usage = nil
			}
		}); err != nil {
			return err
		}
	}
	if record.Terminal != nil {
		// Do not finalize while a newer transcript batch or usage receipt is
		// waiting behind this snapshot.
		latest, _ := store.read(taskID)
		if len(latest.Messages) > 0 || len(latest.Usage) > 0 {
			return fmt.Errorf("new task reports await delivery")
		}
		t := record.Terminal
		body := map[string]any{"session_id": t.SessionID, "work_dir": t.WorkDir, "session_rollout_missing": t.SessionRolloutMissing}
		path := "fail"
		if t.Kind == terminalTaskReportComplete {
			path = "complete"
			body["output"] = t.Output
			body["branch_name"] = t.BranchName
		} else {
			body["error"] = t.Error
			body["failure_reason"] = t.FailureReason
		}
		if err := d.client.postJSON(ctx, fmt.Sprintf("/api/daemon/tasks/%s/%s", taskID, path), body, nil); err != nil {
			if isTransientError(err) {
				return err
			}
			status, statusErr := d.client.GetTaskStatus(ctx, taskID)
			if statusErr != nil || !isAgentTaskTerminal(status) {
				return err
			}
			// A lost acknowledgement commonly leaves the server already in
			// the intended state. A different terminal state remains the
			// server's authority; neither case may re-execute business tools.
			if (path == "complete" && status != "completed") || (path == "fail" && status == "completed") {
				d.logger.Warn("task report rejected after server finalized task", "task_id", taskID, "server_status", status, "error", err)
			}
		}
		if err := store.update(taskID, func(r *pendingTaskReport) {
			if r.Terminal == record.Terminal {
				r.Terminal = nil
			}
		}); err != nil {
			return err
		}
	}
	return store.removeIfEmpty(taskID)
}

func sameTaskReportUsage(a, b []TaskUsageEntry) bool {
	left, _ := json.Marshal(a)
	right, _ := json.Marshal(b)
	return string(left) == string(right)
}

func (d *Daemon) replayTaskReports(ctx context.Context) {
	if d.taskReports == nil {
		return
	}
	ctx, cancelReplay := context.WithTimeout(ctx, 30*time.Second)
	defer cancelReplay()
	for _, id := range d.taskReports.pendingTasks() {
		if ctx.Err() != nil {
			return
		}
		sendCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		err := d.deliverTaskReport(sendCtx, id)
		cancel()
		if err != nil {
			if isTaskNotFoundError(err) {
				// A deleted task cannot receive any callback. Retire its
				// receipts so they do not retain the workdir indefinitely.
				if retireErr := d.taskReports.update(id, func(r *pendingTaskReport) {
					r.Session, r.Messages, r.Usage, r.Terminal = nil, nil, nil, nil
				}); retireErr == nil {
					_ = d.taskReports.removeIfEmpty(id)
					continue
				}
			}
			d.logger.Warn("task report remains pending", "task_id", id, "error", err)
		}
	}
}

func (d *Daemon) taskReportLoop(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			d.replayTaskReports(ctx)
		case <-ctx.Done():
			return
		}
	}
}

func taskUsageEntries(provider string, usage map[string]agent.TokenUsage) []TaskUsageEntry {
	var entries []TaskUsageEntry
	for model, u := range usage {
		if u.InputTokens == 0 && u.OutputTokens == 0 && u.CacheReadTokens == 0 && u.CacheWriteTokens == 0 {
			continue
		}
		entries = append(entries, TaskUsageEntry{Provider: provider, Model: model,
			InputTokens: u.InputTokens, OutputTokens: u.OutputTokens,
			CacheReadTokens: u.CacheReadTokens, CacheWriteTokens: u.CacheWriteTokens, CostUSDTicks: u.CostUSDTicks})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Model < entries[j].Model })
	return entries
}

func (d *Daemon) pendingTaskReportsProtectDirectory(dir string) bool {
	if d.taskReports == nil {
		return false
	}
	d.taskReports.mu.Lock()
	defer d.taskReports.mu.Unlock()
	for _, record := range d.taskReports.records {
		workDir := record.WorkDir
		if workDir == "" && record.Terminal != nil {
			workDir = record.Terminal.WorkDir
		}
		if workDir == "" {
			continue
		}
		rel, err := filepath.Rel(dir, workDir)
		if err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return true
		}
	}
	return false
}
