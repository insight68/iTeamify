package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/codeany-ai/open-agent-sdk-go/types"
)

func pipeConnection(t *testing.T) (*Connection, *io.PipeReader, *io.PipeWriter, *atomic.Int32) {
	t.Helper()
	requestReader, requestWriter := io.Pipe()
	responseReader, responseWriter := io.Pipe()
	closes := &atomic.Int32{}
	conn := &Connection{stdin: requestWriter, stdout: responseReader, reader: bufio.NewReader(responseReader), cleanup: func() {
		closes.Add(1)
		_ = requestWriter.Close()
		_ = requestReader.Close()
		_ = responseReader.Close()
		_ = responseWriter.Close()
	}}
	t.Cleanup(conn.close)
	return conn, requestReader, responseWriter, closes
}

func TestStdioSerializesRequestsAndCorrelatesResponses(t *testing.T) {
	conn, reader, writer, _ := pipeConnection(t)
	serverDone := make(chan struct{})
	go func() {
		defer close(serverDone)
		decoder := json.NewDecoder(reader)
		for i := 0; i < 20; i++ {
			var req JSONRPCRequest
			if err := decoder.Decode(&req); err != nil {
				return
			}
			_, _ = fmt.Fprintf(writer, "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\"}\n{\"jsonrpc\":\"2.0\",\"id\":%d,\"result\":{\"echo\":%q}}\n", req.ID, req.Method)
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			method := fmt.Sprint(i)
			result, err := conn.sendRequest(ctx, method, nil)
			if err != nil {
				t.Error(err)
				return
			}
			var reply struct {
				Echo string `json:"echo"`
			}
			if err := json.Unmarshal(result, &reply); err != nil || reply.Echo != method {
				t.Errorf("method=%s response=%s error=%v", method, result, err)
			}
		}(i)
	}
	wg.Wait()
	conn.close()
	<-serverDone
}

func TestStdioCancellationReleasesReaderAndClosesOnce(t *testing.T) {
	conn, reader, _, closes := pipeConnection(t)
	started := make(chan struct{})
	go func() { var req JSONRPCRequest; _ = json.NewDecoder(reader).Decode(&req); close(started) }()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { _, err := conn.sendRequest(ctx, "tools/call", nil); done <- err }()
	<-started
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("blocked stdio read survived cancellation")
	}
	conn.close()
	conn.close()
	if closes.Load() != 1 {
		t.Fatalf("closes=%d", closes.Load())
	}
}

func TestStdioRejectsMismatchedResponseID(t *testing.T) {
	conn, reader, writer, _ := pipeConnection(t)
	go func() {
		var req JSONRPCRequest
		_ = json.NewDecoder(reader).Decode(&req)
		_, _ = io.WriteString(writer, "{\"jsonrpc\":\"2.0\",\"id\":9999,\"result\":{}}\n")
	}()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := conn.sendRequest(ctx, "tools/list", nil); err == nil {
		t.Fatal("mismatched response accepted")
	}
}

func TestIsolatedEmptyEnvironmentDoesNotUseExecInheritance(t *testing.T) {
	env := NewClientWithOptions(ClientOptions{}).stdioEnvironment(types.MCPServerConfig{})
	if env == nil || len(env) != 0 {
		t.Fatalf("isolated empty environment=%v", env)
	}
}

func TestQueuedStdioCallCanCancelWithoutClosingActiveCall(t *testing.T) {
	conn, reader, writer, closes := pipeConnection(t)
	started := make(chan int, 1)
	go func() { var req JSONRPCRequest; _ = json.NewDecoder(reader).Decode(&req); started <- req.ID }()
	firstCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	first := make(chan error, 1)
	go func() { _, err := conn.sendRequest(firstCtx, "first", nil); first <- err }()
	id := <-started
	queuedCtx, cancelQueued := context.WithCancel(context.Background())
	cancelQueued()
	if _, err := conn.sendRequest(queuedCtx, "queued", nil); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if closes.Load() != 0 {
		t.Fatal("cancelled queued call closed the active stream")
	}
	go func() { _, _ = fmt.Fprintf(writer, "{\"jsonrpc\":\"2.0\",\"id\":%d,\"result\":{}}\n", id) }()
	if err := <-first; err != nil {
		t.Fatal(err)
	}
}
