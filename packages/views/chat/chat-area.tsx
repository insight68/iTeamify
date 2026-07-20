"use client";

import { useMemo, useRef, useState, type ComponentProps } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@teamify/ui/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@teamify/ui/components/ui/dropdown-menu";
import type { AgentAvailability } from "@teamify/core/agents";
import { ActorAvatar } from "../common/actor-avatar";
import { OfflineBanner } from "./components/offline-banner";
import { NoAgentBanner } from "./components/no-agent-banner";
import { ChatMessageList, ChatMessageSkeleton } from "./components/chat-message-list";
import { ChatInput } from "./components/chat-input";
import {
  buildChatTurnNavigationItems,
  CHAT_TURN_NAVIGATION_MIN_TURNS,
  ChatTurnNavigationRail,
  type ChatTurnNavigationLayout,
} from "./components/chat-turn-navigation-rail";
import {
  ContextAnchorButton,
  ContextAnchorCard,
} from "./components/context-anchor";
import type { Agent, ChatMessage, ChatPendingTask } from "@teamify/core/types";
import { useT } from "../i18n";

interface ChatAreaProps {
  hasSession: boolean;
  messages: ChatMessage[];
  messagesLoading: boolean;
  pendingTask: ChatPendingTask | null | undefined;
  availability: AgentAvailability | undefined;
  noAgent: boolean;
  activeAgent: Agent | null;
  availableAgents: Agent[];
  userId: string | undefined;
  onSend: (content: string, attachmentIds?: string[]) => void;
  onStop: () => void;
  onAgentSelected: (agent: Agent) => void;
  onUploadFile: ComponentProps<typeof ChatInput>["onUploadFile"];
}

export function ChatArea({
  hasSession,
  messages,
  messagesLoading,
  pendingTask,
  availability,
  noAgent,
  activeAgent,
  availableAgents,
  userId,
  onSend,
  onStop,
  onAgentSelected,
  onUploadFile,
}: ChatAreaProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pendingTaskId = pendingTask?.task_id ?? null;
  const hasMessages = messages.length > 0 || !!pendingTaskId;
  const showSkeleton = hasSession && messagesLoading;
  const pendingAlreadyPersisted =
    !!pendingTaskId &&
    messages.some(
      (message) =>
        message.role === "assistant" && message.task_id === pendingTaskId,
    );
  const isTurnStreaming =
    !!pendingTaskId &&
    !pendingTaskId.startsWith("optimistic-") &&
    !pendingAlreadyPersisted;
  const turnNavigationItems = useMemo(
    () =>
      showSkeleton
        ? []
        : buildChatTurnNavigationItems(messages, isTurnStreaming),
    [isTurnStreaming, messages, showSkeleton],
  );
  const [turnNavigationLayout, setTurnNavigationLayout] =
    useState<ChatTurnNavigationLayout>("hidden");
  const effectiveTurnNavigationLayout =
    turnNavigationItems.length < CHAT_TURN_NAVIGATION_MIN_TURNS
      ? "hidden"
      : turnNavigationLayout === "standard"
        ? "standard"
        : "compact";

  return (
    <div
      data-slot="chat-window"
      data-turn-navigation-layout={effectiveTurnNavigationLayout}
      className="relative isolate h-full min-h-0 min-w-0 overflow-hidden rounded-lg border bg-background shadow-sm"
    >
      <div
        className={cn(
          "flex h-full min-h-0 min-w-0 flex-col transition-[padding] duration-150",
          // In compact mode the whole chat surface yields to the rail, so it
          // cannot overlap messages, status banners, or the composer.
          effectiveTurnNavigationLayout === "compact" && "pl-9",
        )}
      >
        {/* Messages / skeleton / empty state */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {showSkeleton ? (
            <ChatMessageSkeleton />
          ) : hasMessages ? (
            <ChatMessageList
              messages={messages}
              pendingTask={pendingTask}
              availability={availability}
              scrollContainerRef={scrollContainerRef}
            />
          ) : (
            <EmptyState
              hasSessions={hasSession}
              agentName={activeAgent?.name}
              chatEmptyStateTitle={activeAgent?.chat_empty_state_title}
              onPickPrompt={(text) => onSend(text)}
            />
          )}
        </div>

        {/* Status banner */}
        {noAgent ? (
          <NoAgentBanner />
        ) : (
          <OfflineBanner
            agentName={activeAgent?.name}
            availability={availability}
          />
        )}

        {/* Input */}
        <div className="shrink-0">
          <ChatInput
            onSend={onSend}
            onStop={onStop}
            isRunning={!!pendingTaskId}
            noAgent={noAgent}
            agentName={activeAgent?.name}
            onUploadFile={onUploadFile}
            topSlot={<ContextAnchorCard />}
            leftAdornment={
              <AgentDropdown
                agents={availableAgents}
                activeAgent={activeAgent}
                userId={userId}
                onSelect={onAgentSelected}
              />
            }
            rightAdornment={<ContextAnchorButton />}
          />
        </div>
      </div>

      {/* The full-window anchor keeps the bottom-aligned rail visible even
       * when a tool module compresses the message viewport above it. */}
      <ChatTurnNavigationRail
        items={turnNavigationItems}
        scrollContainerRef={scrollContainerRef}
        onLayoutChange={setTurnNavigationLayout}
      />
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
  chatEmptyStateTitle,
  onPickPrompt,
}: {
  hasSessions: boolean;
  agentName?: string;
  chatEmptyStateTitle?: string;
  onPickPrompt: (text: string) => void;
}) {
  const { t } = useT("chat");
  const firstTimeTitle =
    chatEmptyStateTitle?.trim() || t(($) => $.empty_state.first_time_title);
  if (!hasSessions) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8">
        <div className="text-center space-y-3">
          <h3 className="text-base font-semibold">
            {firstTimeTitle}
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
