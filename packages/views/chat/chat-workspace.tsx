"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDefaultLayout } from "react-resizable-panels";
import { api } from "@teamify/core/api";
import { useAgentPresenceDetail, useWorkspaceAgentAvailability } from "@teamify/core/agents";
import { useAuthStore } from "@teamify/core/auth";
import { useChatStore } from "@teamify/core/chat";
import { useCreateChatSession } from "@teamify/core/chat/mutations";
import {
  chatKeys,
  chatMessagesOptions,
  pendingChatTaskOptions,
} from "@teamify/core/chat/queries";
import { useWorkspaceId } from "@teamify/core/hooks";
import { useFileUpload } from "@teamify/core/hooks/use-file-upload";
import { createLogger } from "@teamify/core/logger";
import { canAssignAgentToIssue } from "@teamify/core/permissions";
import type { Agent, ChatMessage, ChatPendingTask } from "@teamify/core/types";
import { agentListOptions, memberListOptions } from "@teamify/core/workspace/queries";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@teamify/ui/components/ui/resizable";
import { ChatArea } from "./chat-area";
import {
  ChatToolModules,
  hasEnabledChatToolModules,
} from "./components/chat-tool-modules";
import {
  buildAnchorMarkdown,
  useRouteAnchorCandidate,
} from "./components/context-anchor";
import { useChatTaskReconciliation } from "./use-chat-task-reconciliation";

const apiLogger = createLogger("chat.api");

interface ChatWorkspaceProps {
  activeSessionId: string | null;
  selectedAgentId: string | null;
  onSessionCreated: (id: string) => void;
  onAgentSelected: (agentId: string) => void;
}

/**
 * Owns the chat route's workspace layout. Agent tools and the chat window are
 * siblings here so tools never become part of the chat window DOM boundary.
 */
export function ChatWorkspace({
  activeSessionId,
  selectedAgentId,
  onSessionCreated,
  onAgentSelected,
}: ChatWorkspaceProps) {
  const wsId = useWorkspaceId();
  const user = useAuthStore((s) => s.user);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const splitRootRef = useRef<HTMLDivElement>(null);

  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const { data: rawMessages, isLoading: messagesLoading } = useQuery(
    chatMessagesOptions(activeSessionId ?? ""),
  );
  const { data: pendingTask } = useQuery(
    pendingChatTaskOptions(activeSessionId ?? ""),
  );

  const messages = activeSessionId ? rawMessages ?? [] : [];
  const pendingTaskId = pendingTask?.task_id ?? null;

  useChatTaskReconciliation({
    sessionId: activeSessionId,
    pendingTaskId,
    messages,
  });

  const currentMember = members.find((member) => member.user_id === user?.id);
  const memberRole = currentMember?.role;
  const availableAgents = useMemo(
    () => agents.filter(
      (agent) =>
        !agent.archived_at &&
        canAssignAgentToIssue(agent, {
          userId: user?.id ?? null,
          role: memberRole ?? null,
        }).allowed,
    ),
    [agents, memberRole, user?.id],
  );

  const activeAgent =
    availableAgents.find((agent) => agent.id === selectedAgentId) ??
    availableAgents[0] ??
    null;

  const agentAvailability = useWorkspaceAgentAvailability();
  const noAgent = agentAvailability === "none";
  const presenceDetail = useAgentPresenceDetail(wsId, activeAgent?.id);
  const availability =
    presenceDetail === "loading" ? undefined : presenceDetail.availability;

  const { candidate: anchorCandidate } = useRouteAnchorCandidate(wsId);
  const queryClient = useQueryClient();
  const createSession = useCreateChatSession();
  const { uploadWithToast } = useFileUpload(api, undefined, { direct: true });

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
      queryClient.setQueryData<ChatMessage[]>(
        chatKeys.messages(sessionId),
        (old) => old ? [...old, optimistic] : [optimistic],
      );
      queryClient.setQueryData<ChatPendingTask>(chatKeys.pendingTask(sessionId), {
        task_id: optimistic.id,
        status: "queued",
        created_at: sentAt,
      });

      const result = await api.sendChatMessage(sessionId, finalContent, attachmentIds);
      queryClient.setQueryData<ChatPendingTask>(chatKeys.pendingTask(sessionId), (old) => {
        if (!old?.task_id) return old;
        return { ...old, task_id: result.task_id, created_at: result.created_at };
      });
    },
    [
      activeAgent,
      activeSessionId,
      anchorCandidate,
      createSession,
      onSessionCreated,
      queryClient,
      setActiveSession,
    ],
  );

  const handleStop = useCallback(() => {
    if (!pendingTaskId || !activeSessionId) return;
    queryClient.setQueryData(chatKeys.pendingTask(activeSessionId), {});
    queryClient.invalidateQueries({ queryKey: chatKeys.messages(activeSessionId) });
    api.cancelTaskById(pendingTaskId).then(
      () => apiLogger.info("cancelTask.success", { taskId: pendingTaskId }),
      (error) => apiLogger.warn("cancelTask.error", { taskId: pendingTaskId, error }),
    );
  }, [activeSessionId, pendingTaskId, queryClient]);

  const handleSelectAgent = useCallback((agent: Agent) => {
    if (agent.id !== activeAgent?.id) {
      onAgentSelected(agent.id);
    }
  }, [activeAgent?.id, onAgentSelected]);

  const splitLayoutId = activeAgent
    ? `chat-table-split-${activeAgent.id}`
    : "chat-table-split";
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: splitLayoutId,
  });
  const toolModulesEnabled = hasEnabledChatToolModules(activeAgent);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!toolModulesEnabled) return;
      if (event.ctrlKey && event.shiftKey && event.key === "ArrowUp") {
        event.preventDefault();
        splitRootRef.current?.querySelector<HTMLElement>('[role="separator"]')?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [toolModulesEnabled]);

  const chatWindow = (
    <ChatArea
      hasSession={!!activeSessionId}
      messages={messages}
      messagesLoading={messagesLoading}
      pendingTask={pendingTask}
      availability={availability}
      noAgent={noAgent}
      activeAgent={activeAgent}
      availableAgents={availableAgents}
      userId={user?.id}
      onSend={handleSend}
      onStop={handleStop}
      onAgentSelected={handleSelectAgent}
      onUploadFile={uploadWithToast}
    />
  );

  if (!toolModulesEnabled || !activeAgent) {
    return (
      <div
        data-slot="chat-workspace"
        className="h-full min-h-0 min-w-0 bg-muted/30 p-2"
      >
        {chatWindow}
      </div>
    );
  }

  return (
    <div
      ref={splitRootRef}
      data-slot="chat-workspace"
      className="h-full min-h-0 min-w-0 bg-muted/30"
    >
      <ResizablePanelGroup
        id={splitLayoutId}
        orientation="vertical"
        className="h-full"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        <ResizablePanel
          id="table"
          defaultSize="66.67%"
          minSize="25%"
          maxSize="85%"
        >
          <ChatToolModules agent={activeAgent} sessionId={activeSessionId ?? ""} />
        </ResizablePanel>
        <ResizableHandle
          withHandle
          aria-label="Resize table and chat panels"
          className="bg-muted/30 transition-colors data-[panel-group-direction=vertical]:h-1.5 before:top-1/2 before:-translate-y-1/2 before:bg-border/20 hover:before:bg-foreground/15 focus-visible:before:bg-foreground/20 data-[separator=active]:before:bg-foreground/20 [&[data-panel-group-direction=vertical]>div]:h-px [&[data-panel-group-direction=vertical]>div]:w-8 [&[data-panel-group-direction=vertical]>div]:rotate-0 [&[data-panel-group-direction=vertical]>div]:bg-muted-foreground/20 [&[data-panel-group-direction=vertical]>div]:transition-colors hover:[&[data-panel-group-direction=vertical]>div]:bg-muted-foreground/35 data-[separator=active]:[&[data-panel-group-direction=vertical]>div]:bg-muted-foreground/35"
        />
        <ResizablePanel id="chat-content" minSize="15%">
          <div className="h-full min-h-0 px-2 pb-2 pt-0">
            {chatWindow}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
