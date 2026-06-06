"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { cn } from "@teamify/ui/lib/utils";
import { Button } from "@teamify/ui/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@teamify/ui/components/ui/alert-dialog";
import { ActorAvatar } from "../common/actor-avatar";
import {
  chatSessionsOptions,
  pendingChatTasksOptions,
} from "@teamify/core/chat/queries";
import { useDeleteChatSession } from "@teamify/core/chat/mutations";
import { useChatStore } from "@teamify/core/chat";
import { useWorkspaceId } from "@teamify/core/hooks";
import type { Agent, ChatSession } from "@teamify/core/types";
import { useT } from "../i18n";

interface SessionListPanelProps {
  agents: Agent[];
  activeSessionId: string | null;
  onSelectSession: (session: ChatSession) => void;
  onNewChat: () => void;
}

export function SessionListPanel({
  agents,
  activeSessionId,
  onSelectSession,
  onNewChat,
}: SessionListPanelProps) {
  const { t } = useT("chat");
  const wsId = useWorkspaceId();
  const { data: sessions = [] } = useQuery(chatSessionsOptions(wsId));

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const { active, archived } = useMemo(() => {
    const active: ChatSession[] = [];
    const archived: ChatSession[] = [];
    for (const s of sessions) {
      if (s.status === "archived") archived.push(s);
      else active.push(s);
    }
    return { active, archived };
  }, [sessions]);

  const [showArchived, setShowArchived] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ChatSession | null>(null);
  const deleteSession = useDeleteChatSession();
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const formatTimeAgo = useFormatTimeAgo();

  const { data: pending } = useQuery(pendingChatTasksOptions(wsId));
  const inFlightSessionIds = useMemo(
    () => new Set((pending?.tasks ?? []).map((t) => t.chat_session_id)),
    [pending],
  );

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    const sessionId = pendingDelete.id;
    if (activeSessionId === sessionId) setActiveSession(null);
    deleteSession.mutate(sessionId, {
      onSettled: () => setPendingDelete(null),
    });
  };

  const renderRow = (session: ChatSession) => {
    const isCurrent = session.id === activeSessionId;
    const agent = agentById.get(session.agent_id) ?? null;
    const isRunning = inFlightSessionIds.has(session.id);

    return (
      <div
        key={session.id}
        role="button"
        tabIndex={0}
        onClick={() => onSelectSession(session)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectSession(session);
          }
        }}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors cursor-pointer",
          isCurrent
            ? "bg-accent text-accent-foreground"
            : "text-foreground/80 hover:bg-accent/50",
        )}
      >
        {agent ? (
          <ActorAvatar
            actorType="agent"
            actorId={agent.id}
            size={24}
            enableHoverCard
            showStatusDot
          />
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">
            {session.title?.trim() || t(($) => $.window.untitled)}
          </div>
          <div className="truncate text-xs text-muted-foreground/70">
            {formatTimeAgo(session.updated_at)}
          </div>
        </div>
        {isRunning ? (
          <span
            aria-label={t(($) => $.window.running)}
            title={t(($) => $.window.running)}
            className="size-1.5 shrink-0 rounded-full bg-amber-500 animate-pulse"
          />
        ) : session.has_unread ? (
          <span
            aria-label={t(($) => $.window.unread)}
            title={t(($) => $.window.unread)}
            className="size-1.5 shrink-0 rounded-full bg-brand"
          />
        ) : null}
        {isCurrent && <Check className="size-3.5 text-muted-foreground shrink-0" />}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPendingDelete(session);
          }}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={t(($) => $.session_history.row_delete_aria)}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col border-r bg-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <span className="text-sm font-semibold">{t(($) => $.page.title)}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full text-muted-foreground"
          onClick={onNewChat}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {sessions.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            {t(($) => $.page.no_sessions)}
          </div>
        ) : (
          <>
            {active.map(renderRow)}
            {archived.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  className="flex w-full items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showArchived ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronRight className="size-3" />
                  )}
                  <span>
                    {t(($) => $.window.archived_group, { count: archived.length })}
                  </span>
                </button>
                {showArchived && archived.map(renderRow)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deleteSession.isPending) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(($) => $.session_history.delete_dialog.title)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.title
                ? t(($) => $.session_history.delete_dialog.description_with_title, {
                    title: pendingDelete.title,
                  })
                : t(($) => $.session_history.delete_dialog.description_default)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSession.isPending}>
              {t(($) => $.session_history.delete_dialog.cancel)}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteSession.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteSession.isPending
                ? t(($) => $.session_history.delete_dialog.confirming)
                : t(($) => $.session_history.delete_dialog.confirm)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function useFormatTimeAgo(): (dateStr: string) => string {
  const { t } = useT("chat");
  return (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t(($) => $.session_history.time.just_now);
    if (diffMins < 60) return t(($) => $.session_history.time.minutes, { count: diffMins });
    if (diffHours < 24) return t(($) => $.session_history.time.hours, { count: diffHours });
    if (diffDays < 7) return t(($) => $.session_history.time.days, { count: diffDays });
    return date.toLocaleDateString();
  };
}
