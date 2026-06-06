"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@teamify/ui/components/ui/dropdown-menu";
import { useWorkspaceId } from "@teamify/core/hooks";
import { useAuthStore } from "@teamify/core/auth";
import { agentListOptions, memberListOptions } from "@teamify/core/workspace/queries";
import { canAssignAgentToIssue } from "@teamify/core/permissions";
import { api } from "@teamify/core/api";
import { useAgentPresenceDetail, useWorkspaceAgentAvailability } from "@teamify/core/agents";
import { ActorAvatar } from "../common/actor-avatar";
import { OfflineBanner } from "./components/offline-banner";
import { NoAgentBanner } from "./components/no-agent-banner";
import {
  chatMessagesOptions,
  pendingChatTaskOptions,
  chatKeys,
} from "@teamify/core/chat/queries";
import { useCreateChatSession } from "@teamify/core/chat/mutations";
import { useChatStore } from "@teamify/core/chat";
import { ChatMessageList, ChatMessageSkeleton } from "./components/chat-message-list";
import { ChatInput } from "./components/chat-input";
import {
  ContextAnchorButton,
  ContextAnchorCard,
  buildAnchorMarkdown,
  useRouteAnchorCandidate,
} from "./components/context-anchor";
import { createLogger } from "@teamify/core/logger";
import type { Agent, ChatMessage, ChatPendingTask } from "@teamify/core/types";
import { useT } from "../i18n";
import { useFileUpload } from "@teamify/core/hooks/use-file-upload";

const apiLogger = createLogger("chat.api");

interface ChatAreaProps {
  activeSessionId: string | null;
  selectedAgentId: string | null;
  onSessionCreated: (id: string) => void;
  onAgentSelected: (agentId: string) => void;
}

export function ChatArea({
  activeSessionId,
  selectedAgentId,
  onSessionCreated,
  onAgentSelected,
}: ChatAreaProps) {
  const wsId = useWorkspaceId();
  const user = useAuthStore((s) => s.user);
  const setActiveSession = useChatStore((s) => s.setActiveSession);

  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: members = [] } = useQuery(memberListOptions(wsId));

  const { data: rawMessages, isLoading: messagesLoading } = useQuery(
    chatMessagesOptions(activeSessionId ?? ""),
  );
  const messages = activeSessionId ? rawMessages ?? [] : [];
  const showSkeleton = !!activeSessionId && messagesLoading;

  const { data: pendingTask } = useQuery(
    pendingChatTaskOptions(activeSessionId ?? ""),
  );
  const pendingTaskId = pendingTask?.task_id ?? null;

  const currentMember = members.find((m) => m.user_id === user?.id);
  const memberRole = currentMember?.role;
  const availableAgents = useMemo(
    () =>
      agents.filter(
        (a) =>
          !a.archived_at &&
          canAssignAgentToIssue(a, { userId: user?.id ?? null, role: memberRole ?? null }).allowed,
      ),
    [agents, user?.id, memberRole],
  );

  const activeAgent =
    availableAgents.find((a) => a.id === selectedAgentId) ??
    availableAgents[0] ??
    null;

  const agentAvailability = useWorkspaceAgentAvailability();
  const noAgent = agentAvailability === "none";

  const presenceDetail = useAgentPresenceDetail(wsId, activeAgent?.id);
  const availability =
    presenceDetail === "loading" ? undefined : presenceDetail.availability;

  // Focus-mode anchor
  const { candidate: anchorCandidate } = useRouteAnchorCandidate(wsId);

  const qc = useQueryClient();
  const createSession = useCreateChatSession();
  const { uploadWithToast } = useFileUpload(api);

  const handleSend = useCallback(
    async (content: string, attachmentIds?: string[]) => {
      if (!activeAgent) {
        apiLogger.warn("sendChatMessage skipped: no active agent");
        return;
      }

      const focusOn = useChatStore.getState().focusMode;
      const finalContent = focusOn && anchorCandidate
        ? `${buildAnchorMarkdown(anchorCandidate)}\n\n${content}`
        : content;

      let sessionId = activeSessionId;

      if (!sessionId) {
        const session = await createSession.mutateAsync({
          agent_id: activeAgent.id,
          title: finalContent.slice(0, 50),
        });
        sessionId = session.id;
        setActiveSession(sessionId);
        onSessionCreated(sessionId);
      }

      const sentAt = new Date().toISOString();
      const optimistic: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        chat_session_id: sessionId,
        role: "user",
        content: finalContent,
        task_id: null,
        created_at: sentAt,
      };
      qc.setQueryData<ChatMessage[]>(
        chatKeys.messages(sessionId),
        (old) => (old ? [...old, optimistic] : [optimistic]),
      );
      qc.setQueryData<ChatPendingTask>(chatKeys.pendingTask(sessionId), {
        task_id: optimistic.id,
        status: "queued",
        created_at: sentAt,
      });

      const result = await api.sendChatMessage(sessionId, finalContent, attachmentIds);
      qc.setQueryData<ChatPendingTask>(chatKeys.pendingTask(sessionId), (old) => {
        // WS already cleared pending task (completed/failed/cancelled) — don't resurrect it
        if (!old || !old.task_id) return old;
        // Preserve WS-updated status (e.g. "running"), only upgrade task_id
        return { ...old, task_id: result.task_id, created_at: result.created_at };
      });
      qc.invalidateQueries({ queryKey: chatKeys.messages(sessionId) });
    },
    [activeSessionId, activeAgent, anchorCandidate, createSession, setActiveSession, onSessionCreated, qc],
  );

  
  const handleStop = useCallback(() => {
    if (!pendingTaskId || !activeSessionId) return;
    qc.setQueryData(chatKeys.pendingTask(activeSessionId), {});
    qc.invalidateQueries({ queryKey: chatKeys.messages(activeSessionId) });
    api.cancelTaskById(pendingTaskId).then(
      () => apiLogger.info("cancelTask.success", { taskId: pendingTaskId }),
      (err) => apiLogger.warn("cancelTask.error", { taskId: pendingTaskId, err }),
    );
  }, [pendingTaskId, activeSessionId, qc]);

  const handleSelectAgent = useCallback(
    (agent: Agent) => {
      if (activeAgent && agent.id === activeAgent.id) return;
      onAgentSelected(agent.id);
    },
    [activeAgent, onAgentSelected],
  );

  const hasMessages = messages.length > 0 || !!pendingTaskId;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Messages / skeleton / empty state */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {showSkeleton ? (
          <ChatMessageSkeleton />
        ) : hasMessages ? (
          <ChatMessageList
            messages={messages}
            pendingTask={pendingTask}
            availability={availability}
          />
        ) : (
          <EmptyState
            hasSessions={!!activeSessionId}
            agentName={activeAgent?.name}
            onPickPrompt={(text) => handleSend(text)}
          />
        )}
      </div>

      {/* Status banner */}
      {noAgent ? (
        <NoAgentBanner />
      ) : (
        <OfflineBanner agentName={activeAgent?.name} availability={availability} />
      )}

      {/* Input */}
      <div className="shrink-0">
        <ChatInput
          onSend={handleSend}
          onStop={handleStop}
          isRunning={!!pendingTaskId}
          noAgent={noAgent}
          agentName={activeAgent?.name}
          onUploadFile={uploadWithToast}
          topSlot={<ContextAnchorCard />}
          leftAdornment={
            <AgentDropdown
              agents={availableAgents}
              activeAgent={activeAgent}
              userId={user?.id}
              onSelect={handleSelectAgent}
            />
          }
          rightAdornment={<ContextAnchorButton />}
        />
      </div>
    </div>
  );
}

/**
 * Agent dropdown — lets user pick which agent to chat with.
 */
function AgentDropdown({
  agents,
  activeAgent,
  userId,
  onSelect,
}: {
  agents: Agent[];
  activeAgent: Agent | null;
  userId: string | undefined;
  onSelect: (agent: Agent) => void;
}) {
  const { t } = useT("chat");
  const { mine, others } = useMemo(() => {
    const mine: Agent[] = [];
    const others: Agent[] = [];
    for (const a of agents) {
      if (a.owner_id === userId) mine.push(a);
      else others.push(a);
    }
    return { mine, others };
  }, [agents, userId]);

  if (!activeAgent) {
    return <span className="text-xs text-muted-foreground">{t(($) => $.window.no_agents)}</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-1.5 py-1 -ml-1 cursor-pointer outline-none transition-colors hover:bg-accent aria-expanded:bg-accent">
        <ActorAvatar
          actorType="agent"
          actorId={activeAgent.id}
          size={24}
          enableHoverCard
          showStatusDot
        />
        <span className="text-xs font-medium max-w-28 truncate">{activeAgent.name}</span>
        <ChevronDown className="size-3 text-muted-foreground shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="max-h-80 w-auto max-w-64">
        {mine.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t(($) => $.window.my_agents)}</DropdownMenuLabel>
            {mine.map((agent) => (
              <AgentMenuItem
                key={agent.id}
                agent={agent}
                isCurrent={agent.id === activeAgent.id}
                onSelect={onSelect}
              />
            ))}
          </DropdownMenuGroup>
        )}
        {mine.length > 0 && others.length > 0 && <DropdownMenuSeparator />}
        {others.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t(($) => $.window.others)}</DropdownMenuLabel>
            {others.map((agent) => (
              <AgentMenuItem
                key={agent.id}
                agent={agent}
                isCurrent={agent.id === activeAgent.id}
                onSelect={onSelect}
              />
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AgentMenuItem({
  agent,
  isCurrent,
  onSelect,
}: {
  agent: Agent;
  isCurrent: boolean;
  onSelect: (agent: Agent) => void;
}) {
  return (
    <DropdownMenuItem
      onClick={() => onSelect(agent)}
      className="flex min-w-0 items-center gap-2"
    >
      <ActorAvatar
        actorType="agent"
        actorId={agent.id}
        size={24}
        enableHoverCard
        showStatusDot
      />
      <span className="truncate flex-1">{agent.name}</span>
      {isCurrent && <Check className="size-3.5 text-muted-foreground shrink-0" />}
    </DropdownMenuItem>
  );
}

// Starter prompts
const STARTER_KEYS: ("list_open" | "summarize_today" | "plan_next")[] = [
  "list_open",
  "summarize_today",
  "plan_next",
];
const STARTER_ICONS: Record<(typeof STARTER_KEYS)[number], string> = {
  list_open: "📋",
  summarize_today: "📝",
  plan_next: "💡",
};

function EmptyState({
  hasSessions,
  agentName,
  onPickPrompt,
}: {
  hasSessions: boolean;
  agentName?: string;
  onPickPrompt: (text: string) => void;
}) {
  const { t } = useT("chat");
  if (!hasSessions) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8">
        <div className="text-center space-y-3">
          <h3 className="text-base font-semibold">
            {t(($) => $.empty_state.first_time_title)}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(($) => $.empty_state.first_time_intro)}{" "}
            <span className="font-medium text-foreground">
              {t(($) => $.empty_state.first_time_pillars)}
            </span>
            {t(($) => $.empty_state.first_time_pillars_suffix)}
          </p>
          <p className="text-sm text-muted-foreground">
            {t(($) => $.empty_state.first_time_actions)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8">
      <div className="text-center space-y-1">
        <h3 className="text-base font-semibold">
          {agentName
            ? t(($) => $.empty_state.returning_title_named, { name: agentName })
            : t(($) => $.empty_state.returning_title_default)}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(($) => $.empty_state.returning_subtitle)}
        </p>
      </div>
      <div className="w-full max-w-xs space-y-2">
        {STARTER_KEYS.map((key) => {
          const text = t(($) => $.starter_prompts[key]);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPickPrompt(text)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent hover:border-brand/40"
            >
              <span className="mr-2">{STARTER_ICONS[key]}</span>
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
