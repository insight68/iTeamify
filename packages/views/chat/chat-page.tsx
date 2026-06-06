"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDefaultLayout } from "react-resizable-panels";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@teamify/ui/components/ui/resizable";
import { useWorkspaceId } from "@teamify/core/hooks";
import { agentListOptions } from "@teamify/core/workspace/queries";
import { chatSessionsOptions } from "@teamify/core/chat/queries";
import { useMarkChatSessionRead } from "@teamify/core/chat/mutations";
import { useChatStore } from "@teamify/core/chat";
import { useNavigation } from "../navigation";
import { useWorkspacePaths } from "@teamify/core/paths";
import type { ChatSession } from "@teamify/core/types";
import { SessionListPanel } from "./session-list-panel";
import { ChatArea } from "./chat-area";
import { createLogger } from "@teamify/core/logger";

const logger = createLogger("chat.page");

export function ChatPage() {
  const wsId = useWorkspaceId();
  const { push, replace, searchParams } = useNavigation();
  const p = useWorkspacePaths();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "chat-page",
  });

  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const selectedAgentId = useChatStore((s) => s.selectedAgentId);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const setSelectedAgentId = useChatStore((s) => s.setSelectedAgentId);

  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: sessions = [] } = useQuery(chatSessionsOptions(wsId));

  // Reactive URL → store sync (fires on URL change + session load)
  const processedUrlRef = useRef("");
  useEffect(() => {
    const sessionParam = searchParams.get("session") ?? "";
    const agentParam = searchParams.get("agent") ?? "";
    const key = `${sessionParam}|${agentParam}`;

    if (key === processedUrlRef.current && sessions.length > 0) return;
    processedUrlRef.current = key;

    if (sessionParam) {
      setActiveSession(sessionParam);
      const session = sessions.find((s) => s.id === sessionParam);
      if (session && session.agent_id !== selectedAgentId) {
        setSelectedAgentId(session.agent_id);
      }
    } else if (agentParam) {
      setSelectedAgentId(agentParam);
      const agentSessions = sessions
        .filter((s) => s.agent_id === agentParam && s.status !== "archived")
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      const latest = agentSessions[0];
      if (latest) {
        setActiveSession(latest.id);
        replace(p.chatsWithSession(latest.id));
      } else {
        setActiveSession(null);
      }
    } else {
      setActiveSession(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, sessions]);

  // Auto mark-as-read when viewing a session
  const currentHasUnread =
    sessions.find((s) => s.id === activeSessionId)?.has_unread ?? false;
  const markRead = useMarkChatSessionRead();
  useEffect(() => {
    if (!activeSessionId || !currentHasUnread || markRead.isPending) return;
    logger.info("auto markRead", { sessionId: activeSessionId });
    markRead.mutate(activeSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, currentHasUnread]);

  const handleSelectSession = useCallback(
    (session: ChatSession) => {
      if (session.agent_id !== selectedAgentId) {
        setSelectedAgentId(session.agent_id);
      }
      setActiveSession(session.id);
      push(p.chatsWithSession(session.id));
    },
    [selectedAgentId, setSelectedAgentId, setActiveSession, push, p],
  );

  const handleNewChat = useCallback(() => {
    setActiveSession(null);
    push(p.chats());
  }, [setActiveSession, push, p]);

  const handleSessionCreated = useCallback(
    (id: string) => {
      push(p.chatsWithSession(id));
    },
    [push, p],
  );

  const handleAgentSelected = useCallback(
    (agentId: string) => {
      setSelectedAgentId(agentId);
      const agentSessions = sessions
        .filter((s) => s.agent_id === agentId && s.status !== "archived")
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      const latest = agentSessions[0];
      if (latest) {
        setActiveSession(latest.id);
        push(p.chatsWithSession(latest.id));
      } else {
        setActiveSession(null);
        push(p.chatsWithAgent(agentId));
      }
    },
    [sessions, setSelectedAgentId, setActiveSession, push, p],
  );

  return (
    <div className="flex h-full">
      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1 min-h-0"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        <ResizablePanel
          id="sessions"
          defaultSize={280}
          minSize={220}
          maxSize={360}
          collapsible
          groupResizeBehavior="preserve-pixel-size"
        >
          <SessionListPanel
            agents={agents}
            activeSessionId={activeSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="chat" minSize="50%">
          <ChatArea
            activeSessionId={activeSessionId}
            selectedAgentId={selectedAgentId}
            onSessionCreated={handleSessionCreated}
            onAgentSelected={handleAgentSelected}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
