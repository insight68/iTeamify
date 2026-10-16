package daemon

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/iteamify-ai/iteamify/server/pkg/agent"
)

type reportTestTransport func(*http.Request) (*http.Response, error)

func (f reportTestTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

const reportTaskID = "94364bfc-98cd-4002-b50d-4f0eb25c0463"
const reportRuntimeID = "b04a915c-630c-4376-b5a2-56e9c7203d65"

func reportResponse(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}
}

func reportTestDaemon(t *testing.T, root string, transport http.RoundTripper) *Daemon {
	t.Helper()
	store, err := openTaskReportStore(root, "https://server.invalid", "daemon-test")
	if err != nil {
		t.Fatal(err)
	}
	client := NewClient("https://server.invalid")
	client.client.Transport = transport
	return &Daemon{taskReports: store, client: client, logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
}

func TestTaskReportsReplayAfterRestartWithoutExecutingTask(t *testing.T) {
	root := t.TempDir()
	var healthy atomic.Bool
	var mu sync.Mutex
	var delivered []string
	transport := reportTestTransport(func(r *http.Request) (*http.Response, error) {
		if !healthy.Load() {
			return reportResponse(503, "temporary outage"), nil
		}
		mu.Lock()
		delivered = append(delivered, filepath.Base(r.URL.Path))
		mu.Unlock()
		return reportResponse(200, `{}`), nil
	})
	d := reportTestDaemon(t, root, transport)
	if err := d.taskReports.begin(reportTaskID, reportRuntimeID); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := d.reportTaskSession(ctx, reportTaskID, "session-1", "/tmp/work"); err == nil {
		t.Fatal("expected outage")
	}
	if err := d.reportTaskMessages(ctx, reportTaskID, []TaskMessageData{{Seq: 1, Type: "text", Content: "complete answer"}}); err == nil {
		t.Fatal("expected outage")
	}
	if err := d.reportTaskUsage(ctx, reportTaskID, []TaskUsageEntry{{Provider: "openagent", Model: "test-model", InputTokens: 100}}); err == nil {
		t.Fatal("expected outage")
	}
	if err := d.reportTerminalTask(ctx, terminalTaskReport{kind: terminalTaskReportComplete, taskID: reportTaskID, output: "complete answer"}); err == nil {
		t.Fatal("expected outage")
	}
	d.taskReports.release(reportTaskID)

	restarted := reportTestDaemon(t, root, transport)
	restarted.runner = taskRunnerFunc(func(context.Context, Task, string, int, *slog.Logger) (TaskResult, error) {
		t.Error("replay re-executed a business task")
		return TaskResult{}, errors.New("must not execute")
	})
	if ids := restarted.pendingTerminalTaskIDs(reportRuntimeID); len(ids) != 1 || ids[0] != reportTaskID {
		t.Fatalf("protected tasks = %v", ids)
	}
	healthy.Store(true)
	restarted.replayTaskReports(ctx)
	if strings.Join(delivered, ",") != "session,messages,usage,complete" {
		t.Fatalf("delivery order = %v", delivered)
	}
	if _, exists := restarted.taskReports.read(reportTaskID); exists {
		t.Fatal("acknowledged report was retained")
	}
	if _, err := os.Stat(filepath.Join(restarted.taskReports.dir, reportTaskID+".json")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("journal still exists: %v", err)
	}
}

func TestTaskReportsReconcileLostTerminalAcknowledgement(t *testing.T) {
	root := t.TempDir()
	var completed atomic.Bool
	var failCalls atomic.Int32
	transport := reportTestTransport(func(r *http.Request) (*http.Response, error) {
		switch filepath.Base(r.URL.Path) {
		case "complete":
			if !completed.Swap(true) {
				return nil, io.ErrUnexpectedEOF
			}
			return reportResponse(409, "task already completed"), nil
		case "status":
			return reportResponse(200, `{"status":"completed"}`), nil
		case "fail":
			failCalls.Add(1)
		}
		return reportResponse(200, `{}`), nil
	})
	d := reportTestDaemon(t, root, transport)
	if err := d.taskReports.begin(reportTaskID, reportRuntimeID); err != nil {
		t.Fatal(err)
	}
	if err := d.reportTerminalTask(context.Background(), terminalTaskReport{kind: terminalTaskReportComplete, taskID: reportTaskID, output: "done"}); err == nil {
		t.Fatal("expected lost acknowledgement")
	}
	d.taskReports.release(reportTaskID)
	restarted := reportTestDaemon(t, root, transport)
	restarted.replayTaskReports(context.Background())
	if _, exists := restarted.taskReports.read(reportTaskID); exists || failCalls.Load() != 0 {
		t.Fatalf("report retained=%v failure callbacks=%d", exists, failCalls.Load())
	}
}

func TestTaskReportsPreserveAppendDuringAcknowledgement(t *testing.T) {
	firstStarted, release := make(chan struct{}), make(chan struct{})
	var requests atomic.Int32
	transport := reportTestTransport(func(r *http.Request) (*http.Response, error) {
		if requests.Add(1) == 1 {
			close(firstStarted)
			<-release
		}
		return reportResponse(200, `{}`), nil
	})
	d := reportTestDaemon(t, t.TempDir(), transport)
	if err := d.taskReports.begin(reportTaskID, reportRuntimeID); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		done <- d.reportTaskMessages(context.Background(), reportTaskID, []TaskMessageData{{Seq: 1, Type: "text", Content: "first"}})
	}()
	<-firstStarted
	if err := d.taskReports.update(reportTaskID, func(r *pendingTaskReport) {
		r.Messages = append(append([]TaskMessageData(nil), r.Messages...), TaskMessageData{Seq: 2, Type: "text", Content: "second"})
	}); err != nil {
		t.Fatal(err)
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	record, _ := d.taskReports.read(reportTaskID)
	if len(record.Messages) != 1 || record.Messages[0].Seq != 2 {
		t.Fatalf("pending messages = %v", record.Messages)
	}
	if err := d.deliverTaskReport(context.Background(), reportTaskID); err != nil {
		t.Fatal(err)
	}
}

func TestTaskReportStoreRejectsSymlinkAndMalformedRecord(t *testing.T) {
	root := t.TempDir()
	if err := os.Symlink(t.TempDir(), filepath.Join(root, ".task-reports")); err != nil {
		t.Fatal(err)
	}
	if _, err := openTaskReportStore(root, "https://server.invalid", "daemon-test"); err == nil {
		t.Fatal("accepted symlink")
	}
	root = t.TempDir()
	store, err := openTaskReportStore(root, "https://server.invalid", "daemon-test")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(store.dir, reportTaskID+".json"), []byte(`{"version":1,"task_id":"different"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := openTaskReportStore(root, "https://server.invalid", "daemon-test"); err == nil {
		t.Fatal("accepted provenance mismatch")
	}
}

type usageOnCancelBackend struct{}

func (usageOnCancelBackend) Execute(ctx context.Context, _ string, _ agent.ExecOptions) (*agent.Session, error) {
	messages := make(chan agent.Message)
	result := make(chan agent.Result, 1)
	go func() {
		<-ctx.Done()
		close(messages)
		time.Sleep(20 * time.Millisecond)
		result <- agent.Result{Status: "cancelled", Usage: map[string]agent.TokenUsage{"test-model": {InputTokens: 100, OutputTokens: 7}}}
		close(result)
	}()
	return &agent.Session{Messages: messages, Result: result}, nil
}

func TestExecuteAndDrainPreservesCancellationReceiptUsage(t *testing.T) {
	d := &Daemon{logger: slog.Default()}
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(20 * time.Millisecond); cancel() }()
	result, _, err := d.executeAndDrain(ctx, usageOnCancelBackend{}, "prompt", agent.ExecOptions{}, slog.Default(), reportTaskID, "", new(atomic.Int32))
	if err != nil || result.Status != "cancelled" || result.Usage["test-model"].InputTokens != 100 {
		t.Fatalf("result=%+v error=%v", result, err)
	}
}

func TestTaskReportsRetryDuringActiveRunAndProtectWorkdir(t *testing.T) {
	root := t.TempDir()
	var healthy atomic.Bool
	d := reportTestDaemon(t, root, reportTestTransport(func(*http.Request) (*http.Response, error) {
		if !healthy.Load() {
			return reportResponse(503, "temporary outage"), nil
		}
		return reportResponse(200, `{}`), nil
	}))
	if err := d.taskReports.begin(reportTaskID, reportRuntimeID); err != nil {
		t.Fatal(err)
	}
	workdir := filepath.Join(root, "task", "workdir")
	if err := d.taskReports.update(reportTaskID, func(r *pendingTaskReport) { r.WorkDir = workdir }); err != nil {
		t.Fatal(err)
	}
	if err := d.reportTaskMessages(context.Background(), reportTaskID, []TaskMessageData{{Seq: 1, Type: "text", Content: "live output"}}); err == nil {
		t.Fatal("expected outage")
	}
	if !d.pendingTaskReportsProtectDirectory(filepath.Join(root, "task")) {
		t.Fatal("pending receipts did not protect workdir")
	}
	healthy.Store(true)
	d.replayTaskReports(context.Background())
	record, exists := d.taskReports.read(reportTaskID)
	if !exists || len(record.Messages) != 0 {
		t.Fatalf("active report=%+v exists=%v", record, exists)
	}
	d.taskReports.release(reportTaskID)
	d.replayTaskReports(context.Background())
	if d.pendingTaskReportsProtectDirectory(filepath.Join(root, "task")) {
		t.Fatal("acknowledged receipts still protect workdir")
	}
}

func TestTaskReportsRetireDeletedTask(t *testing.T) {
	d := reportTestDaemon(t, t.TempDir(), reportTestTransport(func(*http.Request) (*http.Response, error) {
		return reportResponse(404, `{"error":"task not found"}`), nil
	}))
	if err := d.reportTerminalTask(context.Background(), terminalTaskReport{kind: terminalTaskReportComplete, taskID: reportTaskID, output: "done"}); err == nil {
		t.Fatal("expected deleted task")
	}
	d.replayTaskReports(context.Background())
	if _, exists := d.taskReports.read(reportTaskID); exists {
		t.Fatal("deleted task receipts were retained")
	}
}
