"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { chatKeys } from "@teamify/core/chat/queries";
import type { ChatMessage } from "@teamify/core/types";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 60_000;

interface ReconciliationTarget {
  sessionId: string;
  taskId: string;
  terminalExpiresAt: number | null;
}

interface UseChatTaskReconciliationOptions {
  sessionId: string | null;
  pendingTaskId: string | null;
  messages: readonly ChatMessage[];
  pollIntervalMs?: number;
  timeoutMs?: number;
}

/**
 * Reconciles the WS-driven live state with persisted chat data.
 *
 * The target survives the pending -> terminal transition. Polling only stops
 * once the assistant message for that exact task is present (or after the
 * bounded timeout), so a pending-task response cannot win the race and cancel
 * the final messages refetch prematurely.
 */
export function useChatTaskReconciliation({
  sessionId,
  pendingTaskId,
  messages,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: UseChatTaskReconciliationOptions) {
  const qc = useQueryClient();
  const targetRef = useRef<ReconciliationTarget | null>(null);

  if (!sessionId) {
    targetRef.current = null;
  } else if (targetRef.current?.sessionId !== sessionId) {
    targetRef.current = null;
  }

  const isServerTask = pendingTaskId && !pendingTaskId.startsWith("optimistic-");
  if (sessionId && isServerTask) {
    const current = targetRef.current;
    if (!current || current.taskId !== pendingTaskId) {
      targetRef.current = {
        sessionId,
        taskId: pendingTaskId,
        terminalExpiresAt: null,
      };
    } else if (current.terminalExpiresAt !== null) {
      // A stale terminal response must not time out a task that the server
      // subsequently reports as active again (for example after reconnect).
      current.terminalExpiresAt = null;
    }
  } else if (
    targetRef.current?.sessionId === sessionId
    && targetRef.current.terminalExpiresAt === null
  ) {
    // Bound only the terminal convergence window. Long-running tasks should
    // retain the polling fallback for their entire active lifetime.
    targetRef.current.terminalExpiresAt = Date.now() + timeoutMs;
  }

  useEffect(() => {
    const target = targetRef.current;
    if (!target || target.sessionId !== sessionId) return;

    const hasAssistantMessage = messages.some(
      (message) =>
        message.role === "assistant" && message.task_id === target.taskId,
    );
    if (hasAssistantMessage) {
      targetRef.current = null;
      return;
    }

    let stopped = false;
    let inFlight = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      stopped = true;
      if (intervalId) clearInterval(intervalId);
    };

    const reconcile = async () => {
      const current = targetRef.current;
      if (stopped || inFlight || !current || current.sessionId !== sessionId) {
        return;
      }
      if (
        current.terminalExpiresAt !== null
        && Date.now() >= current.terminalExpiresAt
      ) {
        targetRef.current = null;
        stop();
        return;
      }

      inFlight = true;
      await Promise.allSettled([
        qc.refetchQueries({
          queryKey: chatKeys.messages(current.sessionId),
          exact: true,
        }),
        qc.refetchQueries({
          queryKey: chatKeys.pendingTask(current.sessionId),
          exact: true,
        }),
        qc.refetchQueries({
          queryKey: chatKeys.taskMessages(current.taskId),
          exact: true,
        }),
      ]);
      inFlight = false;
    };

    intervalId = setInterval(() => {
      void reconcile();
    }, pollIntervalMs);
    void reconcile();

    return stop;
  }, [sessionId, pendingTaskId, messages, pollIntervalMs, timeoutMs, qc]);
}
