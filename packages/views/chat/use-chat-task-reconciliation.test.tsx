import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@teamify/core/types";
import { useChatTaskReconciliation } from "./use-chat-task-reconciliation";

const { refetchQueries } = vi.hoisted(() => ({
  refetchQueries: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ refetchQueries }),
}));

const assistantMessage: ChatMessage = {
  id: "message-1",
  chat_session_id: "session-1",
  role: "assistant",
  content: "Done",
  task_id: "task-1",
  created_at: "2026-07-15T00:00:00Z",
};

describe("useChatTaskReconciliation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refetchQueries.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps reconciling after pending clears until the assistant message arrives", async () => {
    const initialProps: {
      pendingTaskId: string | null;
      messages: ChatMessage[];
    } = { pendingTaskId: "task-1", messages: [] };
    const { rerender } = renderHook(
      ({ pendingTaskId, messages }: {
        pendingTaskId: string | null;
        messages: ChatMessage[];
      }) => useChatTaskReconciliation({
        sessionId: "session-1",
        pendingTaskId,
        messages,
        pollIntervalMs: 1_000,
        timeoutMs: 10_000,
      }),
      { initialProps },
    );

    await act(async () => {});
    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: ["chat", "messages", "session-1"],
      exact: true,
    });
    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: ["task-messages", "task-1"],
      exact: true,
    });

    refetchQueries.mockClear();
    rerender({ pendingTaskId: null, messages: [] });
    await act(async () => {});
    refetchQueries.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: ["chat", "messages", "session-1"],
      exact: true,
    });

    rerender({ pendingTaskId: null, messages: [assistantMessage] });
    await act(async () => {});
    refetchQueries.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(refetchQueries).not.toHaveBeenCalled();
  });

  it("does not start task reconciliation from an optimistic task id", async () => {
    renderHook(() => useChatTaskReconciliation({
      sessionId: "session-1",
      pendingTaskId: "optimistic-123",
      messages: [],
      pollIntervalMs: 1_000,
      timeoutMs: 10_000,
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(refetchQueries).not.toHaveBeenCalled();
  });

  it("does not time out while the task is still pending", async () => {
    renderHook(() => useChatTaskReconciliation({
      sessionId: "session-1",
      pendingTaskId: "task-1",
      messages: [],
      pollIntervalMs: 1_000,
      timeoutMs: 2_500,
    }));

    await act(async () => {});
    refetchQueries.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: ["chat", "messages", "session-1"],
      exact: true,
    });
  });

  it("stops after the bounded timeout once pending has cleared", async () => {
    const { rerender } = renderHook(
      ({ pendingTaskId }: { pendingTaskId: string | null }) =>
        useChatTaskReconciliation({
          sessionId: "session-1",
          pendingTaskId,
          messages: [],
          pollIntervalMs: 1_000,
          timeoutMs: 2_500,
        }),
      { initialProps: { pendingTaskId: "task-1" as string | null } },
    );

    await act(async () => {});
    rerender({ pendingTaskId: null });
    await act(async () => {});

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    refetchQueries.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(refetchQueries).not.toHaveBeenCalled();
  });
});
