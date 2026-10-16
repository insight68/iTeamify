import type { ChatMessagesCursor } from "@iteamify/core/types/chat";
/**
 * Chat query keys + queryOptions factories.
 *
 * Keys:
 *   - sessions(wsId)        → ChatSession[] for the workspace dropdown / sheet
 *   - messages(sessionId)   → InfiniteData<ChatMessagesPage> for the active session
 *   - pendingTask(sessionId)→ ChatPendingTask, populated when an agent task is
 *                             in flight; cleared on chat:done / task:cancelled
 *
 * Same shape as web's `chatKeys` in packages/core/chat/queries.ts (mobile
 * owns its own copy per the "mirror, don't import" rule in apps/mobile/CLAUDE.md).
 *
 * Complete histories use `staleTime: Infinity`; event-only task snapshots
 * remain stale until their persisted history is fetched. Foreground / reconnect invalidates
 * are scoped to each owning hook (see use-chat-sessions-realtime.ts and
 * use-chat-session-realtime.ts).
 */
import { infiniteQueryOptions, queryOptions, type InfiniteData } from "@tanstack/react-query";
import type { ChatMessage, ChatMessagesPage, TaskMessagePayload } from "@iteamify/core/types";
import { mergeTaskMessages } from "@/lib/task-messages";
import { api } from "@/data/api";

export const chatKeys = {
  all: (wsId: string | null) => ["chat", wsId] as const,
  sessions: (wsId: string | null) =>
    [...chatKeys.all(wsId), "sessions"] as const,
  draftRestores: (sessionId: string) => ["chat", "draft-restores", sessionId] as const,
  messages: (sessionId: string) => ["chat", "messages", sessionId] as const,
  pendingTask: (sessionId: string) =>
    ["chat", "pending-task", sessionId] as const,
  /** Per-task live execution timeline (thinking / tool_use / tool_result /
   *  text / error rows). Cache is workspace-agnostic — keyed only on
   *  `taskId` — matching web's `chatKeys.taskMessages` shape so future
   *  cross-feature consumers (issue agent cards) can share the cache.
   *  `task:message` WS events append rows in place; once the task
   *  completes the cache stays warm so the persisted assistant message
   *  can render the same trace without refetching. */
  taskMessages: (taskId: string) => ["task-messages", taskId] as const,
};

// UUID gate mirrors `packages/core/chat/queries.ts`: optimistic task ids
// (`optimistic-…`) are not real backend rows, so the query must be
// disabled until we have a server-issued UUID. Returning the cache for
// an optimistic id would 404 the API.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTaskMessageTaskId(
  taskId: string | null | undefined,
): taskId is string {
  return typeof taskId === "string" && UUID_PATTERN.test(taskId);
}

export const chatSessionsOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: chatKeys.sessions(wsId),
    queryFn: ({ signal }) => api.listChatSessions({ signal }),
    enabled: !!wsId,
    staleTime: Infinity,
  });

export type ChatPages = InfiniteData<ChatMessagesPage>;
export function loadedChatMessages(data: ChatPages | undefined): ChatMessage[] {
  const seen = new Set<string>();
  return data?.pages.flatMap((page) => page.messages).filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  }).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)) ?? [];
}

export const chatMessagesOptions = (sessionId: string | null) =>
  infiniteQueryOptions({
    queryKey: chatKeys.messages(sessionId ?? ""),
    queryFn: ({ signal, pageParam }) => api.listChatMessagesPage(sessionId!, pageParam, { signal }),
    initialPageParam: null as ChatMessagesCursor | null,
    getNextPageParam: (last) => last.has_more ? last.next_cursor ?? undefined : undefined,
    enabled: !!sessionId,
    staleTime: Infinity,
    // An event may have seeded only the latest message before this mount.
    refetchOnMount: "always",
  });

export const chatDraftRestoresOptions = (sessionId: string | null) => queryOptions({
  queryKey: chatKeys.draftRestores(sessionId ?? ""),
  queryFn: ({ signal }) => api.listChatDraftRestores(sessionId!, { signal }),
  enabled: !!sessionId,
  staleTime: 0,
});

export const pendingChatTaskOptions = (sessionId: string | null) =>
  queryOptions({
    queryKey: chatKeys.pendingTask(sessionId ?? ""),
    queryFn: ({ signal }) => api.getPendingChatTask(sessionId!, { signal }),
    enabled: !!sessionId,
    staleTime: Infinity,
  });

export interface TaskMessageSnapshot {
  messages: TaskMessagePayload[];
  hasSnapshot: boolean;
}

export const taskMessagesOptions = (taskId: string | null | undefined) =>
  queryOptions({
    queryKey: chatKeys.taskMessages(taskId ?? ""),
    queryFn: async ({ signal }): Promise<TaskMessageSnapshot> => ({
      messages: await api.listTaskMessages(taskId!, { signal }), hasSnapshot: true,
    }),
    enabled: isTaskMessageTaskId(taskId),
    staleTime: (query) => query.state.data?.hasSnapshot ? Infinity : 0,
    structuralSharing: (old: unknown, next: unknown) => {
      const incoming = next as TaskMessageSnapshot;
      const previous = old as TaskMessageSnapshot | undefined;
      return { ...incoming, messages: mergeTaskMessages(previous?.messages ?? [], incoming.messages), hasSnapshot: incoming.hasSnapshot || previous?.hasSnapshot === true };
    },
    select: (snapshot) => snapshot.messages,
  });
