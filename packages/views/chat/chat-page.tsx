"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PanelLeftOpen } from "lucide-react";
import { useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@teamify/ui/components/ui/resizable";
import { Button } from "@teamify/ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@teamify/ui/components/ui/tooltip";
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
import { useT } from "../i18n";

const logger = createLogger("chat.page");

export function ChatPage() {
  const { t } = useT("chat");
  const wsId = useWorkspaceId();
  const { push, replace, searchParams } = useNavigation();
  const p = useWorkspacePaths();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "chat-page",
  });
  const sessionsPanelRef = usePanelRef();
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSessionsCollapsed(sessionsPanelRef.current?.isCollapsed() ?? false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [defaultLayout, sessionsPanelRef]);

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

  const handleSessionsResize = useCallback(() => {
    setSessionsCollapsed(sessionsPanelRef.current?.isCollapsed() ?? false);
  }, [sessionsPanelRef]);

  const handleRestoreSessions = useCallback(() => {
    sessionsPanelRef.current?.expand();
    setSessionsCollapsed(false);
  }, [sessionsPanelRef]);

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
          panelRef={sessionsPanelRef}
          defaultSize={280}
          minSize={220}
          maxSize={360}
          collapsible
          groupResizeBehavior="preserve-pixel-size"
          onResize={handleSessionsResize}
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
          <div className="relative h-full min-w-0">
            {sessionsCollapsed && (
              <div className="absolute left-3 top-3 z-20">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="rounded-full bg-background/95 shadow-sm backdrop-blur"
                        onClick={handleRestoreSessions}
                        aria-label={t(($) => $.page.restore_sessions)}
                      >
                        <PanelLeftOpen className="size-4" />
                      </Button>
                    }
                  />
                  <TooltipContent side="right">
                    {t(($) => $.page.restore_sessions)}
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
            <ChatArea
              activeSessionId={activeSessionId}
              selectedAgentId={selectedAgentId}
              onSessionCreated={handleSessionCreated}
              onAgentSelected={handleAgentSelected}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
