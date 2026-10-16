/**
 * Chat tab — single-screen IA.
 *
 * Layout:
 *   View ─ Header(center: ChatTitleButton, right: ChatSessionActions)
 *        ─ (NoAgentBanner?)
 *        ─ KeyboardAvoidingView ─ ChatMessageList (includes live status
 *                                                  + timeline in its
 *                                                  ListFooterComponent)
 *                                ─ OfflineBanner
 *                                ─ ChatComposer
 *
 * Session switching, agent selection, and session deletion all happen
 * inside this screen via Modal sheets — there is no `/chat/[id]` sub-route.
 *
 * State (all local, none in Zustand):
 *   - activeSessionId   — which session is being viewed (null = new chat blank)
 *   - selectedAgentId   — overrides currentSession.agent_id when set (used
 *                         when starting a new chat with a freshly-picked agent)
 *   - sessionSheetOpen  — bottom modal visibility
 *   - agentPickerOpen   — bottom modal visibility
 *
 * Side effects:
 *   - useChatSessionRealtime(activeSessionId) for per-record WS events
 *   - auto markRead when entering a session with has_unread
 *   - ensureSession dedupe ref for concurrent first-message sends
 *
 * Optimistic send burst mirrors web's chat-window.tsx send sequence
 * (packages/views/chat/components/chat-window.tsx ~262-345):
 *   seed messages → seed pendingTask → POST → activate a new session →
 *   reconcile pendingTask against the server.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  View,
} from "react-native";
import { router } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Agent,
  ChatMessage,
  ChatPendingTask,
} from "@iteamify/core/types";
import { api } from "@/data/api";
import { useAuthStore } from "@/data/auth-store";
import { getWorkspaceVersion, useWorkspaceStore } from "@/data/workspace-store";
import { agentListOptions } from "@/data/queries/agents";
import { memberListOptions } from "@/data/queries/members";
import {
  chatKeys,
  chatMessagesOptions,
  loadedChatMessages,
  chatSessionsOptions,
  pendingChatTaskOptions,
  taskMessagesOptions,
} from "@/data/queries/chat";
import {
  useCreateChatSession,
  useCancelChatTask,
  useDeleteChatSession,
  useMarkChatSessionRead,
} from "@/data/mutations/chat";
import {
  chatDraftKey,
  useChatDraftsStore,
} from "@/data/stores/chat-drafts-store";
import { useChatSessionPickerStore } from "@/data/stores/chat-session-picker-store";
import { useChatSessionRealtime } from "@/data/realtime/use-chat-session-realtime";
import { canInvokeAgent } from "@iteamify/core/permissions/rules";
import { useWorkspaceAgentAvailability } from "@/lib/workspace-agent-availability";
import { useAgentPresence } from "@/lib/use-agent-presence";
import { useChatDraftRestore } from "@/lib/use-chat-draft-restore";
import { updateChatMessages, removeChatMessage } from "@/data/realtime/chat-ws-updaters";
import { Header } from "@/components/ui/header";
import { ChatTitleButton } from "@/components/chat/chat-title-button";
import { ChatSessionActions } from "@/components/chat/chat-session-actions";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { ChatComposer } from "@/components/chat/chat-composer";
import { AgentPickerSheet } from "@/components/chat/agent-picker-sheet";
import { NoAgentBanner } from "@/components/chat/no-agent-banner";
import { OfflineBanner } from "@/components/chat/offline-banner";
import { useChatSelectStore } from "@/data/chat-select-store";

export default function ChatTab() {
  const qc = useQueryClient();
  const isFocused = useIsFocused();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const userId = useAuthStore((s) => s.user?.id);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  // Bridge to the chat-sessions formSheet route. Mirror local
  // activeSessionId into the store so the picker can render the current
  // selection's check mark; consume the picker's one-shot select request
  // via useEffect.
  const setStoreActiveSessionId = useChatSessionPickerStore(
    (s) => s.setActiveSessionId,
  );
  const selectRequest = useChatSessionPickerStore((s) => s.selectRequest);
  const consumeSelect = useChatSessionPickerStore((s) => s.consumeSelect);
  useEffect(() => {
    setStoreActiveSessionId(activeSessionId);
  }, [activeSessionId, setStoreActiveSessionId]);

  // ── Server state ───────────────────────────────────────────────────────
  const { data: sessions = [], isSuccess: sessionsReady } = useQuery(chatSessionsOptions(wsId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: members = [] } = useQuery(memberListOptions(wsId));

  // ── Auto-hydrate active session on first Chat tab entry ────────────────
  // Mobile-only deviation from web: web's chat-window opens to an empty
  // state when no `activeSessionId` is persisted; on a phone, picking
  // a session is 4 taps, so jump straight to the most recent session.
  // Hydration is one-shot per workspace.
  const hydratedWsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!wsId || !sessionsReady) return;
    if (hydratedWsRef.current === wsId) return;
    if (sessions.length === 0) {
      hydratedWsRef.current = wsId;
      return;
    }
    hydratedWsRef.current = wsId;
    setActiveSessionId(sessions[0].id);
  }, [wsId, sessions, sessionsReady]);
  const { data: messagePages, isLoading: messagesLoading, hasNextPage, fetchNextPage, isFetchingNextPage, isFetchNextPageError, isError: messagesError, refetch: refetchMessages } = useInfiniteQuery(
    chatMessagesOptions(activeSessionId),
  );
  const messages = useMemo(() => loadedChatMessages(messagePages), [messagePages]);
  const { data: pendingTask } = useQuery(
    pendingChatTaskOptions(activeSessionId),
  );
  // Live execution trace for the in-flight task. `task:message` WS events
  // append rows to this same cache key via `appendTaskMessage`, so the
  // list/pill stay in sync without a polling fetch. `enabled` is gated by
  // `isTaskMessageTaskId` inside taskMessagesOptions — optimistic ids
  // never hit the network.
  const { data: liveTaskMessages = [] } = useQuery(
    taskMessagesOptions(pendingTask?.task_id),
  );

  // ── Derived ────────────────────────────────────────────────────────────
  const memberRole = useMemo(
    () => members.find((m) => m.user_id === userId)?.role,
    [members, userId],
  );

  const availableAgents = useMemo(
    () =>
      agents.filter(
        (a) => !a.archived_at && canInvokeAgent(a, { userId: userId ?? null, role: memberRole ?? null }).allowed,
      ),
    [agents, userId, memberRole],
  );

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  // Active agent: explicit selection wins; otherwise inherit from the
  // active session; otherwise pick the first available agent.
  const currentAgent: Agent | null = useMemo(() => {
    if (selectedAgentId) {
      return availableAgents.find((a) => a.id === selectedAgentId) ?? null;
    }
    if (activeSession) {
      return agents.find((a) => a.id === activeSession.agent_id) ?? null;
    }
    return availableAgents[0] ?? null;
  }, [selectedAgentId, availableAgents, activeSession, agents]);

  const availability = useWorkspaceAgentAvailability();
  const presenceDetail = useAgentPresence(wsId, currentAgent?.id);
  const presenceAvailability =
    presenceDetail === "loading" ? undefined : presenceDetail.availability;
  const isArchived = activeSession?.status === "archived";
  const sending = !!pendingTask?.task_id;
  const invokeDecision = currentAgent ? canInvokeAgent(currentAgent, { userId: userId ?? null, role: memberRole ?? null }) : null;
  const accessRevoked = invokeDecision?.allowed === false;
  const runtimeMissing = !!currentAgent && !currentAgent.runtime_id;
  const { restoreRequest, onApplied } = useChatDraftRestore(activeSessionId, isFocused && !isArchived && !accessRevoked);
  const cancelTask = useCancelChatTask(activeSessionId);

  // ── Drafts ─────────────────────────────────────────────────────────────
  const draftKey = chatDraftKey(wsId, activeSessionId);
  const draft = useChatDraftsStore((s) => s.drafts[draftKey] ?? "");
  const setDraft = useChatDraftsStore((s) => s.setDraft);
  const promoteNewDraft = useChatDraftsStore((s) => s.promoteNewDraft);

  // ── Realtime ───────────────────────────────────────────────────────────
  const onSessionDeleted = useCallback(() => setActiveSessionId(null), []);
  useChatSessionRealtime(isFocused ? activeSessionId : null, onSessionDeleted);

  // Exit text-selection mode whenever the chat tab loses focus. Expo
  // Router bottom tabs stay mounted across tab switches, so a plain
  // useEffect cleanup wouldn't fire — useFocusEffect is the navigation-
  // aware equivalent.
  useFocusEffect(
    useCallback(() => () => useChatSelectStore.getState().clear(), []),
  );

  // ── Auto markRead while viewing a session with unread state ──────────
  const markRead = useMarkChatSessionRead();
  useEffect(() => {
    if (!isFocused) return;
    if (!activeSessionId) return;
    if (!activeSession?.has_unread) return;
    markRead.mutate(activeSessionId);
  }, [isFocused, activeSessionId, activeSession?.has_unread, markRead]);

  // ── Mutations ──────────────────────────────────────────────────────────
  const createSession = useCreateChatSession();
  const deleteSession = useDeleteChatSession();

  // ── Send burst ─────────────────────────────────────────────────────────
  const createdSessionRef = useRef<{ agentId: string; id: string } | null>(null);
  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);

  const ensureSession = useCallback(
    async (titleSeed: string): Promise<string | null> => {
      if (activeSessionId) return activeSessionId;
      if (!currentAgent) return null;
      if (createdSessionRef.current?.agentId === currentAgent.id) return createdSessionRef.current.id;
      if (sessionPromiseRef.current) return sessionPromiseRef.current;

      const promise = (async () => {
        try {
          const session = await createSession.mutateAsync({
            agent_id: currentAgent.id,
            title: titleSeed.slice(0, 50),
          });
          createdSessionRef.current = { agentId: currentAgent.id, id: session.id };
          return session.id;
        } finally {
          sessionPromiseRef.current = null;
        }
      })();
      sessionPromiseRef.current = promise;
      return promise;
    },
    [activeSessionId, currentAgent, createSession],
  );

  const handleSend = useCallback(
    async (content: string, attachmentIds: string[] = []) => {
      if (!currentAgent || accessRevoked || runtimeMissing) throw new Error(invokeDecision?.reason ?? "Chat unavailable");
      const version = api.getSessionVersion();
      const workspaceVersion = getWorkspaceVersion();
      setPosting(true);
      try {
        const isNewSession = !activeSessionId;
        const sessionId = await ensureSession(content);
        if (!sessionId) throw new Error("Could not create chat");
        if (version !== api.getSessionVersion() || workspaceVersion !== getWorkspaceVersion()) throw new Error("Session changed");

        const sentAt = new Date().toISOString();
        const optimistic: ChatMessage = {
          id: `optimistic-${Date.now()}`,
          chat_session_id: sessionId,
          role: "user",
          content,
          task_id: null,
          created_at: sentAt,
        };
        updateChatMessages(qc, sessionId, (old) => [...old, optimistic]);
        qc.setQueryData<ChatPendingTask>(chatKeys.pendingTask(sessionId), {
          task_id: `optimistic-${optimistic.id}`,
          status: "queued",
          created_at: sentAt,
        });

        try {
          const result = await api.sendChatMessage(sessionId, content, {
            attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
          });
          if (version !== api.getSessionVersion()) return;
          if (isNewSession) {
            if (wsId) promoteNewDraft(wsId, sessionId);
            setActiveSessionId(sessionId);
          }
          qc.setQueryData<ChatPendingTask>(chatKeys.pendingTask(sessionId), {
            task_id: result.task_id,
            status: "queued",
            created_at: result.created_at,
          });
          qc.invalidateQueries({ queryKey: chatKeys.messages(sessionId) });
          qc.invalidateQueries({ queryKey: chatKeys.pendingTask(sessionId) });
        } catch (err) {
          removeChatMessage(qc, sessionId, optimistic.id);
          qc.setQueryData(chatKeys.pendingTask(sessionId), {});
          throw err;
        }
      } finally {
        setPosting(false);
      }
    },
    [
      activeSessionId,
      currentAgent,
      ensureSession,
      qc,
      promoteNewDraft,
      wsId,
      accessRevoked,
      runtimeMissing,
      invokeDecision?.reason,
    ],
  );

  // ── Cancel in-flight ───────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    if (!pendingTask?.task_id || pendingTask.task_id.startsWith("optimistic-") || !activeSessionId || cancelTask.isPending) return;
    const version = api.getSessionVersion();
    void cancelTask.mutateAsync(pendingTask.task_id).then((result) => {
      if (version !== api.getSessionVersion()) return;
      const restored = result.cancelled_chat_message;
      if (restored?.restore_to_input) {
        removeChatMessage(qc, restored.chat_session_id, restored.message_id);
        useChatDraftsStore.getState().enqueueRestore({ id: restored.message_id, chat_session_id: restored.chat_session_id, content: restored.content, attachments: restored.attachments });
      }
    }).catch(() => {
      if (version === api.getSessionVersion()) Alert.alert("Could not stop task", "The task may still be running. Check its status and try again.");
    });
  }, [pendingTask?.task_id, activeSessionId, cancelTask, qc]);

  // ── Header / sheet actions ─────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    createdSessionRef.current = null;
    if (availableAgents.length > 1) {
      setAgentPickerOpen(true);
      return;
    }
    setSelectedAgentId(null);
    setActiveSessionId(null);
  }, [availableAgents.length]);

  const handlePickAgent = useCallback((agent: Agent) => {
    createdSessionRef.current = null;
    setSelectedAgentId(agent.id);
    setActiveSessionId(null);
  }, []);

  // Apply the user's pick from the chat-sessions route (or "no session"
  // when they delete the active one in the sheet).
  useEffect(() => {
    if (!selectRequest) return;
    setSelectedAgentId(null);
    setActiveSessionId(selectRequest.id);
    consumeSelect();
  }, [selectRequest, consumeSelect]);

  const handleDeleteActive = useCallback(() => {
    if (!activeSession) return;
    Alert.alert(
      "Delete this chat?",
      activeSession.title || "Untitled chat",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const id = activeSession.id;
            setActiveSessionId(null);
            deleteSession.mutate(id);
          },
        },
      ],
      { cancelable: true },
    );
  }, [activeSession, deleteSession]);

  // ── Composer disabled-state ────────────────────────────────────────────
  const disabled =
    !sessionsReady || !currentAgent || accessRevoked || runtimeMissing || availability === "none" || isArchived === true;
  const disabledReason = !sessionsReady ? "Loading conversations" : !currentAgent
    ? "No agent selected"
    : accessRevoked ? "You no longer have permission to use this agent"
    : runtimeMissing ? "This agent needs a runtime before it can chat"
    : availability === "none"
      ? "No agents in this workspace"
      : isArchived
        ? "This chat is archived"
        : undefined;

  return (
    <View className="flex-1 bg-background">
      <Header
        center={
          <ChatTitleButton
            disabled={posting}
            currentSession={activeSession}
            currentAgent={currentAgent}
            onPress={() => {
              if (!wsSlug) return;
              router.push({
                pathname: "/[workspace]/chat-sessions",
                params: { workspace: wsSlug },
              });
            }}
          />
        }
        right={
          <ChatSessionActions
            disabled={posting}
            showMore={!!activeSession}
            onMorePress={handleDeleteActive}
            onNewPress={handleNewChat}
          />
        }
      />
      {availability === "none" ? <NoAgentBanner /> : null}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ChatMessageList
          key={activeSessionId ?? "new"}
          sessionId={activeSessionId}
          hasOlder={hasNextPage}
          loadingOlder={isFetchingNextPage}
          olderError={isFetchNextPageError}
          onLoadOlder={() => { void fetchNextPage(); }}
          error={messagesError && messages.length === 0}
          onRetry={() => { void refetchMessages(); }}
          messages={messages}
          loading={messagesLoading}
          hasSessions={sessions.length > 0}
          agentName={currentAgent?.name}
          onPickPrompt={(text) => setDraft(draftKey, text)}
          pendingTask={pendingTask}
          liveTaskMessages={liveTaskMessages}
          availability={presenceAvailability}
        />
        <OfflineBanner
          agentName={currentAgent?.name}
          availability={presenceAvailability}
        />
        <ChatComposer
          key={activeSessionId ?? "new"}
          restoreRequest={restoreRequest}
          onRestoreApplied={onApplied}
          stopping={cancelTask.isPending}
          value={draft}
          onChangeText={(next) => setDraft(draftKey, next)}
          onSend={handleSend}
          onStop={handleStop}
          sending={sending}
          disabled={disabled}
          disabledReason={disabledReason}
        />
      </KeyboardAvoidingView>

      <AgentPickerSheet
        visible={agentPickerOpen}
        agents={availableAgents}
        currentAgentId={currentAgent?.id ?? null}
        onPick={handlePickAgent}
        onClose={() => setAgentPickerOpen(false)}
      />
    </View>
  );
}
