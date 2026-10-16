import { infiniteQueryOptions, queryOptions, type QueryClient, type InfiniteData } from "@tanstack/react-query";
import { api } from "../api";
import type { TaskMessagePayload } from "../types/events";
import type { ChatSession } from "../types/chat";

// NOTE on workspace scoping:
// `wsId` is used only as part of queryKey for cache isolation per workspace.
// The actual workspace context comes from ApiClient's X-Workspace-Slug header,
// which is set by the URL-driven [workspaceSlug] layout. Callers must ensure
// the header is in sync with the wsId they pass here — otherwise cache writes
// will be misattributed during a workspace switch race window.

export const chatKeys = {
  all: (wsId: string) => ["chat", wsId] as const,
  /** Full sessions list (active + archived); the dropdown splits locally. */
  sessions: (wsId: string) => [...chatKeys.all(wsId), "sessions"] as const,
  scopedSessions: (wsId: string, userId: string, agentId: string, status = "all") => [...chatKeys.all(wsId), "scoped-sessions", userId, "agent", agentId, status] as const,
  session: (wsId: string, id: string) => [...chatKeys.all(wsId), "session", id] as const,
  messagesAll: () => ["chat", "messages"] as const,
  messages: (sessionId: string) => [...chatKeys.messagesAll(), sessionId] as const,
  messagesPageAll: () => ["chat", "messages-page"] as const,
  messagesPage: (sessionId: string) => [...chatKeys.messagesPageAll(), sessionId] as const,
  pendingTaskAll: () => ["chat", "pending-task"] as const,
  pendingTask: (sessionId: string) => [...chatKeys.pendingTaskAll(), sessionId] as const,
  draftRestoresAll: () => ["chat", "draft-restores"] as const,
  /** Durable deferred-cancellation draft restores for a session (#5219). */
  draftRestores: (sessionId: string) => [...chatKeys.draftRestoresAll(), sessionId] as const,
  contextResourcesAll: () => ["chat", "context-resources"] as const,
  /** Registry-backed business records explicitly selected for a session. */
  contextResources: (sessionId: string) =>
    [...chatKeys.contextResourcesAll(), sessionId] as const,
  /** Aggregate of in-flight chat tasks for the current user. */
  pendingTasks: (wsId: string) => [...chatKeys.all(wsId), "pending-tasks"] as const,
  /** Per-user pinned agents for the quick-agent bar. */
  pinnedAgents: (wsId: string) => [...chatKeys.all(wsId), "pinned-agents"] as const,
  /**
   * Boolean "does the user have any in-flight chat task" — the cheap sibling
   * of `pendingTasks`. Kept in sync by the task-lifecycle WS handlers.
   */
  pendingTasksHasAny: (wsId: string) =>
    [...chatKeys.all(wsId), "pending-tasks", "has-any"] as const,
  /** Per-task execution messages — shared with issue agent cards. */
  taskMessagesAll: () => ["task-messages"] as const,
  taskMessages: (taskId: string) => [...chatKeys.taskMessagesAll(), taskId] as const,
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTaskMessageTaskId(taskId: string | null | undefined): taskId is string {
  return typeof taskId === "string" && UUID_PATTERN.test(taskId);
}

export function chatSessionsOptions(wsId: string) {
  return queryOptions({
    queryKey: chatKeys.sessions(wsId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: wsId, signal });
      return requestApi.listChatSessions({ status: "all" });
    },
    staleTime: Infinity,
  });
}

function latestSessionActivity(message: string | null | undefined, activity: string | null | undefined, fallback: string) { return message && activity ? Date.parse(message) > Date.parse(activity) ? message : activity : message ?? activity ?? fallback; }

/** Last-activity timestamp used to rank the IM list (newest first). */
function sessionActivityTime(s: ChatSession): number {
  return new Date(latestSessionActivity(s.last_message?.created_at, s.last_activity_at, s.updated_at)).getTime();
}

/**
 * Orders the chat list the same way the server does: pinned chats first, then
 * everyone else by most-recent activity. Used both to render the list and to
 * re-sort the cache after an optimistic pin/unpin or a WS patch, so a mutated
 * flat cache never renders out of order. Returns a new array; stable for equal
 * keys (Array.prototype.sort is stable), so pinned rows keep their server
 * order when pin timestamps aren't carried in the list payload.
 */
export function sortChatSessions(sessions: ChatSession[]): ChatSession[] {
  return [...sessions].sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return sessionActivityTime(b) - sessionActivityTime(a);
  });
}

/**
 * Number of sessions that should light up the quick-chat FAB unread badge.
 * `chatSessionsOptions` fetches `status=all` (active + archived) so the thread
 * list can render an Archived view, but archived sessions must NOT contribute
 * to the badge: they are read-only and hidden from the default history list, so
 * a badge sourced from one is uncleared-able — the user can't open it to mark it
 * read. Archiving now also drops the external-channel binding server-side, so no
 * new unread should land on an archived session; this filter is the front-end
 * half of that guarantee (MUL-4372).
 */
export function countUnreadChatSessions(sessions: ChatSession[]): number {
  return sessions.filter((s) => s.has_unread && s.status !== "archived").length;
}

export function chatPinnedAgentsOptions(wsId: string) {
  return queryOptions({
    queryKey: chatKeys.pinnedAgents(wsId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: wsId, signal });
      return requestApi.listChatPinnedAgents();
    },
    staleTime: Infinity,
  });
}

export function chatSessionOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: chatKeys.session(wsId, id),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: wsId, signal });
      return requestApi.getChatSession(id, wsId);
    },
    enabled: !!id,
    staleTime: Infinity,
  });
}

export function chatContextResourcesOptions(sessionId: string) {
  return queryOptions({
    queryKey: chatKeys.contextResources(sessionId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ signal });
      return requestApi.listChatContextResources(sessionId);
    },
    enabled: !!sessionId,
    staleTime: Infinity,
  });
}

export function chatMessagesOptions(sessionId: string) {
  return queryOptions({
    queryKey: chatKeys.messages(sessionId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ signal });
      return requestApi.listChatMessages(sessionId);
    },
    enabled: !!sessionId,
    staleTime: Infinity,
  });
}

export function chatMessagesPageOptions(sessionId: string, limit = 50) {
  return infiniteQueryOptions({
    queryKey: chatKeys.messagesPage(sessionId),
    queryFn: ({ pageParam, signal }) => {
      const requestApi = api.withRequestContext({ signal });
      return requestApi.listChatMessagesPage(sessionId, { before: pageParam, limit });
    },
    initialPageParam: null as { created_at: string; id: string } | null,
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.next_cursor ?? undefined : undefined,
    enabled: !!sessionId,
    staleTime: Infinity,
  });
}

/**
 * Pending task for a chat session — the "is something still running?" signal.
 * Refetched via WS invalidation in useRealtimeSync when chat:message / chat:done
 * / task:completed / task:failed arrive.
 */
export function pendingChatTaskOptions(sessionId: string) {
  return queryOptions({
    queryKey: chatKeys.pendingTask(sessionId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ signal });
      return requestApi.getPendingChatTask(sessionId);
    },
    enabled: !!sessionId,
    staleTime: Infinity,
  });
}

/**
 * Durable deferred-cancellation draft restores for a session (#5219).
 * staleTime 0 deliberately overrides the app-wide Infinity default: this is
 * the recovery path for a client that MISSED the chat:cancel_finalized
 * broadcast, so it must actually refetch on every composer mount (an
 * Infinity-fresh cache would pin the first result forever). WS reconnects
 * additionally invalidate chatKeys.draftRestoresAll() in useRealtimeSync,
 * and the initiator's realtime handler invalidates this key when the event
 * does arrive. The response is tiny (usually empty), so the extra fetches
 * are negligible.
 */
export function chatDraftRestoresOptions(sessionId: string) {
  return queryOptions({
    queryKey: chatKeys.draftRestores(sessionId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ signal });
      return requestApi.listChatDraftRestores(sessionId);
    },
    enabled: !!sessionId,
    staleTime: 0,
  });
}

/**
 * Timeline for a single task — rendered by both the live chat view (while a
 * task is running) and AssistantMessage (for completed tasks). WS
 * `task:message` events seed this cache in real time via useRealtimeSync.
 */
export function taskMessagesOptions(taskId: string) {
  return queryOptions({
    queryKey: chatKeys.taskMessages(taskId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ signal });
      return requestApi.listTaskMessages(taskId);
    },
    enabled: isTaskMessageTaskId(taskId),
    staleTime: Infinity,
  });
}

/**
 * Merge task-message batches into one seq-ordered, seq-deduplicated list for
 * the shared `["task-messages", taskId]` cache. Existing entries win on
 * conflict, and the original array reference is preserved when nothing new
 * arrives so React Query observers don't re-render on duplicate events.
 *
 * Both the realtime `task:message` handler (a single payload) and the
 * transcript backfill (a full refetch) write this cache. Routing both through
 * one helper keeps a forced backfill from blind-replacing a seq the WebSocket
 * already delivered — and keeps a late WS event from being lost to an
 * in-flight backfill.
 */
export function mergeTaskMessagesBySeq(
  existing: readonly TaskMessagePayload[],
  incoming: readonly TaskMessagePayload[],
): TaskMessagePayload[] {
  if (incoming.length === 0) return existing as TaskMessagePayload[];
  const knownSeqs = new Set(existing.map((m) => m.seq));
  const fresh = incoming.filter((m) => !knownSeqs.has(m.seq));
  if (fresh.length === 0) return existing as TaskMessagePayload[];
  return [...existing, ...fresh].sort((a, b) => a.seq - b.seq);
}

/**
 * Aggregate of in-flight chat tasks for the current user in this workspace.
 * Drives the FAB "running" indicator while the chat window is minimised —
 * no per-session query is active then, so we need this roll-up.
 */
export function pendingChatTasksOptions(wsId: string) {
  return queryOptions({
    queryKey: chatKeys.pendingTasks(wsId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: wsId, signal });
      return requestApi.listPendingChatTasks();
    },
    staleTime: Infinity,
  });
}

export function scopedAgentSessionsOptions(wsId: string, userId: string, agentId: string, status: "active" | "archived" | "all" = "all") {
  return infiniteQueryOptions({
    queryKey: chatKeys.scopedSessions(wsId, userId, agentId, status),
    queryFn: ({ pageParam, signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: wsId, signal });
      return requestApi.listScopedAgentSessions(wsId, agentId, pageParam, status);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: !!wsId && !!userId && !!agentId,
  });
}

/** Patch loaded scope pages without refetching every page on a streamed turn. */
export function patchScopedChatSession(qc: QueryClient, wsId: string, sessionId: string, patch: Partial<ChatSession>) {
  const previousStatus = qc.getQueryData<ChatSession>(chatKeys.session(wsId, sessionId))?.status
    ?? qc.getQueriesData<InfiniteData<{ sessions: ChatSession[] }>>({ queryKey: [...chatKeys.all(wsId), "scoped-sessions"] }).flatMap(([, data]) => data?.pages.flatMap((page) => page.sessions) ?? []).find((session) => session.id === sessionId)?.status;
  const merge = (session: ChatSession): ChatSession => {
    const next = { ...session, ...patch };
    if (next.status === "archived") return { ...next, container_has_unread: false, has_unread: false, unread_count: 0 };
    if (patch.has_unread === false && next.container_has_unread) return { ...next, has_unread: true };
    return next;
  };
  qc.setQueryData<ChatSession>(chatKeys.session(wsId, sessionId), (old) => old && merge(old));
  qc.setQueriesData<InfiniteData<{ sessions: ChatSession[]; next_cursor: string | null }>>({ queryKey: [...chatKeys.all(wsId), "scoped-sessions"] }, (old) => {
    if (!old || !old.pages.some((page) => page.sessions.some((session) => session.id === sessionId))) return old;
    const sessions = sortScopedChatSessions(old.pages.flatMap((page) => page.sessions).map((session) => session.id === sessionId ? merge(session) : session));
    let offset = 0;
    return { ...old, pages: old.pages.map((page) => {
      const rows = sessions.slice(offset, offset + page.sessions.length); offset += rows.length;
      const last = rows.at(-1);
      return { ...page, sessions: rows, next_cursor: page.next_cursor && last ? `${latestSessionActivity(last.last_message?.created_at, last.last_activity_at, last.created_at)}|${last.id}|${last.pinned === true}` : page.next_cursor };
    }) };
  });
  // Explicit archive/unarchive actions change which status scope owns the row.
  // Refresh these lists on that action; streamed message patches stay local.
  if (patch.status && previousStatus && patch.status !== previousStatus) qc.invalidateQueries({ queryKey: [...chatKeys.all(wsId), "scoped-sessions"] });
}

export function insertScopedChatSession(qc: QueryClient, wsId: string, session: ChatSession) {
  qc.setQueriesData<InfiniteData<{ sessions: ChatSession[]; next_cursor: string | null }>>({ queryKey: [...chatKeys.all(wsId), "scoped-sessions"], predicate: (query) => query.queryKey[5] === session.agent_id && (query.queryKey[6] === "all" || query.queryKey[6] === session.status) }, (old) => {
    if (!old || old.pages.some((p) => p.sessions.some((s) => s.id === session.id))) return old;
    return { ...old, pages: old.pages.map((page, index) => index === 0 ? { ...page, sessions: sortScopedChatSessions([session, ...page.sessions]) } : page) };
  });
}

export function sortScopedChatSessions(sessions: ChatSession[]): ChatSession[] {
  return [...sessions].sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true)
    || Date.parse(latestSessionActivity(b.last_message?.created_at, b.last_activity_at, b.created_at)) - Date.parse(latestSessionActivity(a.last_message?.created_at, a.last_activity_at, a.created_at))
    || b.id.localeCompare(a.id));
}
export function removeScopedChatSession(qc: QueryClient, wsId: string, id: string) {
  qc.setQueriesData<InfiniteData<{ sessions: ChatSession[]; next_cursor: string | null }>>({ queryKey: [...chatKeys.all(wsId), "scoped-sessions"] }, (old) => old && ({ ...old, pages: old.pages.map((page) => ({ ...page, sessions: page.sessions.filter((session) => session.id !== id) })) }));
  qc.removeQueries({ queryKey: chatKeys.session(wsId, id) });
}
