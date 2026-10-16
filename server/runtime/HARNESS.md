# OpenAgent harness execution contract

The SDK executes one conversation. `server/pkg/agent/openagent.go` translates
events and persists conversation checkpoints. The existing daemon owns task
claims, leases, capacity and task reporting. Physical execution capacity can be
shared; histories, credentials, work directories and tool permissions stay
scoped to each task. No additional scheduler or server-internal worker pool is
introduced by this change.

## Guarantees enforced by the runtime

- A single Agent admits one query at a time. Overlapping queries, required MCP
  queries before successful initialization, and queries after Close fail before
  a model request. Close cancels the active query. Clear returns an error during
  an active query. History snapshots own their nested content and tool inputs.
- The tool catalog is sorted, and the same filtered catalog governs both model
  visibility and execution. A model cannot execute an unadvertised tool by
  inventing its name. Permission callbacks must explicitly allow execution;
  nil, ask, deny, unknown behavior and interrupted decisions produce tool errors.
  Child Agents inherit parent isolation, endpoint format and tool restrictions;
  a subagent definition can further restrict its actual catalog.
  The tool-prefix and caller-owned system prompt carry prompt cache markers;
  actual cache hits and provider latency require real-provider verification.
- Adjacent concurrency-safe tools use at most eight workers by default.
  `Options.MaxConcurrentTools` changes that per-query limit. Unsafe tools form
  ordering barriers; results retain model call order. Permission checks run
  serially and concurrency classification uses the approved input. Cancelled
  queued calls produce errors without calling tools. Built-in file tools use
  synchronized file-read state.
- Model HTTP connection pools are shared across tasks without sharing request
  credentials. Private proxy transports are released by Close. A fail-closed
  IsolationPolicy reaches the API client and MCP transports: no process API
  credentials, custom headers, timeout, proxy or child environment is inherited.
- Both provider adapters retry transient HTTP failures only before exposing a
  model stream. Backoff is cancellable; Retry-After is capped at 30 seconds.
  Retries retain the request ID and the final provider error body. Tool calls
  and partial model streams are not automatically replayed.
- Stdio MCP requests serialize access to the response stream and verify response
  IDs. Cancellation closes the connection and releases blocking pipe reads,
  preventing late responses from being delivered to later calls. Cleanup runs
  once. HTTP RPC responses also verify IDs. Replaced or closed clients release
  connections instead of retaining child processes.
- Text, tool input, thinking and signatures accumulate in linear buffers.
  Unfinished blocks, duplicate tool call IDs, malformed arguments and oversized
  responses fail before tool execution. Token usage from interrupted streams
  remains in the terminal result.
- `Options.MaxContextBytes` bounds the serialized model request, including
  system prompt, tools and history; the default is 16 MiB. Overflow returns
  `context_limit`, makes no model request and does not invoke a fallback model.
  History is retained. This is a byte guard, not automatic semantic compaction
  or a provider-specific token window calculation.

Other fixed bounds are 8 MiB of streamed content per model response, 1,024
content blocks, 128 tool calls per response, 32 MiB per buffered API/MCP response
and 64 KiB of provider error text. Existing adapter checkpoint limits and managed
turn/time/cost limits continue to apply. Custom tools must honor their context;
an arbitrary in-process tool that ignores cancellation cannot be force-stopped
by Go. Custom file-state users should use GetFileReadState/SetFileReadState.

## Verification

From `server/runtime`:

```sh
../../scripts/go-test-with-agent-cli-guard.sh -- go test -race ./...
go vet ./...
go test ./agent -run '^$' -bench '^BenchmarkStreamAssembly$' -benchmem -count=3
```

From `server`:

```sh
../scripts/go-test-with-agent-cli-guard.sh -- go test -race -p 2 -parallel 2 ./pkg/agent ./internal/daemon -count=1
go vet ./pkg/agent ./internal/daemon
```

The regression suite covers ordered read/write batches, bounded concurrency,
approved-input classification, permissions, actual catalog enforcement, shared
file state under race detection, query admission, history ownership, context
overflow, stream validation, retry cancellation, provider diagnostics and MCP
correlation/cancellation. Existing adapter tests cover streamed tool output,
checkpoint persistence and resume. Tests use fixtures and test processes;
they do not provide real-provider acceptance.

On a local Apple M4/Go 1.26.1, assembling 4,096 text deltas of 32 bytes each
measured 16.0–20.6 ms and about 281.9 MB allocated per operation before the
change. Three runs after the change measured 98.6–138.6 microseconds and about
515 KB allocated, with 25 allocations instead of roughly 4,110. These measure
assembly work, not model latency, overall task throughput or production SLOs.

Local verification on 2026-10-13 passed the SDK-wide race suite, final core
race tests, the real test-process MCP cancellation check, OpenAgent adapter
tests, the complete daemon race suite, Go vet, and the CLI/daemon binary build.
The complete Agent adapter race suite failed two Codex timing tests:
`TestCodexExecuteCleansUpWhenScannerOverflowsOnResume` took about 7.1 seconds
against a 5-second bound in the serial rerun, and
`TestCodexExecuteTimesOutWhenTurnStopsAfterToolResult` exceeded its test receipt
deadline. Both passed when run individually. The Codex implementation was not
changed; the complete adapter suite is not
claimed as passing. The serial run log is at
`/private/tmp/iteamify-openagent-harness-agent-tests.jsonl` and the isolated
reproduction logs at `/private/tmp/iteamify-openagent-harness-codex-repro.log`
and `/private/tmp/iteamify-openagent-harness-codex-timeout-repro.log`.

## Production acceptance still required

Run real managed tasks with both normal completion and cancellation, validate
restart/resume across daemon interruption, and measure time to first output,
tool latency, RSS, active goroutines and open connections under sustained task
load. Confirm tenant isolation using separate workspaces and task credentials.
No production deployment or authenticated model run is implied by local tests.

For stronger crash guarantees, domain tools need task/call idempotency keys and
durable per-call receipts: a conversation checkpoint alone cannot guarantee
exactly-once external writes between a tool side effect and checkpoint commit.
Automatic context compaction also needs explicit evaluation of retained task
requirements and replay validity before replacing conversation history.
