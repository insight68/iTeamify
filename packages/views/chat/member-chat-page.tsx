"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowUp, MessageSquare } from "lucide-react";
import { useAuthStore } from "@iteamify/core/auth";
import { useWorkspaceId } from "@iteamify/core/hooks";
import { memberListOptions } from "@iteamify/core/workspace/queries";
import { resolvePublicFileUrl } from "@iteamify/core/workspace/avatar-url";
import {
  directDraftKey, directMessagesOptions, directSessionsOptions, directSessionOptions, removePendingDirectMessage,
  setDirectDraft, useDirectDraftStore, useMarkDirectMessagesRead,
  useSendDirectMessage, type PendingDirectMessage, type DirectSendResult,
} from "@iteamify/core/team";
import { ActorAvatar } from "@iteamify/ui/components/common/actor-avatar";
import { Button } from "@iteamify/ui/components/ui/button";
import { Textarea } from "@iteamify/ui/components/ui/textarea";
import { PageHeader } from "../layout/page-header";
import { useAppForeground } from "../common/use-app-foreground";
import { useT, useDateTime } from "../i18n";

import { useWorkspacePaths } from "@iteamify/core/paths";
import { useShortcut, shortcutMatchesEvent } from "@iteamify/core/shortcuts";
import { AppLink, useNavigation } from "../navigation";
import { ChatSessionRow, formatChatTime } from "./components/chat-session-row";
import { ChatShell } from "./components/chat-shell";
import { ContainerPicker } from "./session-containers/container-picker";
import { SessionContainerHost } from "./session-containers/container-host";

const EMPTY_PENDING: PendingDirectMessage[] = [];

export function MemberChatPage({ userId: otherId }: { userId: string }) {
  const { t } = useT("chat");
  const wsId = useWorkspaceId();
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const { searchParams, replace } = useNavigation();
  const paths = useWorkspacePaths();
  const sessionId = searchParams.get("session");
  const newId = searchParams.get("new");
  const selected = useQuery({ ...directSessionOptions(wsId, userId, sessionId ?? ""), enabled: !!sessionId });
  const query = useInfiniteQuery(directSessionsOptions(wsId, userId, otherId));
  const sessions = query.data?.pages.flatMap((p) => p.sessions) ?? [];
  const { data: members } = useQuery(memberListOptions(wsId));
  const member = members?.find((m) => m.user_id === otherId);
  const name = member?.name || member?.email || t(($) => $.direct.former_member);
  const navigate = useCallback((id: string, creating = false) => replace(`${paths.chat()}?member=${otherId}&${creating ? "new" : "session"}=${id}`), [replace, paths, otherId]);
  useEffect(() => {
    if (sessionId || newId || searchParams.get("view") === "list" || !query.isSuccess) return;
    const recent = query.data.pages[0]?.sessions[0];
    navigate(recent?.id ?? crypto.randomUUID(), !recent);
  }, [sessionId, newId, searchParams, query.isSuccess, query.data, navigate]);
  const selection = useRef(sessionId ?? newId);
  selection.current = sessionId ?? newId;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const onCreated = (result: DirectSendResult) => {
    if (mounted.current && selection.current === result.session.id) navigate(result.session.id);
  };
  const listTitle = t(($) => $.page.topics_with, { name });
  const listHeader = <PageHeader className="justify-between"><h1 className="truncate text-sm font-semibold" title={listTitle}>{listTitle}</h1>
    <ContainerPicker target={{ kind: "member", id: otherId }} disabled={!member} onSelect={(type) => replace(`${paths.chat()}?member=${otherId}&new=${crypto.randomUUID()}&container=${type}`)} />
  </PageHeader>;
  const listBody = <div className="space-y-1 px-2 py-1">
    {query.isPending && <p className="p-3 text-sm text-muted-foreground">{t(($) => $.direct.loading)}</p>}
    {query.isError && <Button variant="ghost" onClick={() => void query.refetch()}>{t(($) => $.direct.retry)}</Button>}
    {sessions.map((session) => <ChatSessionRow key={session.id} active={session.id === sessionId} unread={session.has_unread}
      title={session.title || name} time={session.last_activity_at || session.last_message_at ? formatChatTime(session.last_activity_at && Date.parse(session.last_activity_at) > Date.parse(session.last_message_at ?? "1970-01-01") ? session.last_activity_at : session.last_message_at ?? session.last_activity_at!) : ""} onSelect={() => navigate(session.id)}
      detail={<div className="mt-0.5 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{session.container?.type === "contract_review" ? t(($) => $.containers.contract_review) : session.last_message_content}</span>
        {session.has_unread && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label={t(($) => $.window.unread)} />}
      </div>} />)}
    {query.hasNextPage && <Button variant="ghost" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{t(($) => $.message_list.load_older)}</Button>}
  </div>;
  const targetId = sessionId ?? newId;
  return <ChatShell listHeader={listHeader} listBody={listBody} hasTarget={!!targetId}
    onBack={() => replace(`${paths.chat()}?member=${otherId}&view=list`)}
    content={targetId ? sessionId && selected.isPending ? <p className="p-4 text-sm text-muted-foreground">{t(($) => $.direct.loading)}</p> : selected.isError || (sessionId && selected.data?.peer_user_id !== otherId) ? <p role="alert" className="p-4 text-sm text-destructive">{t(($) => $.direct.load_failed)}</p> : <SessionContainerHost descriptor={sessionId ? selected.data?.container : { type: searchParams.get("container") ?? "conversation" }} target={{ kind: "direct", id: otherId, name }} sessionId={targetId} creating={!sessionId} onCreated={(id) => navigate(id)} conversation={() => <MemberConversation key={`${wsId}:${userId}:${otherId}:${targetId}`} otherId={otherId} sessionId={targetId} creating={!sessionId} onCreated={onCreated} />} /> : null} />;
}

function MemberConversation({ otherId, sessionId, creating, onCreated }: { otherId: string; sessionId: string; creating: boolean; onCreated: (result: DirectSendResult) => void }) {
  const { t } = useT("chat");
  const paths = useWorkspacePaths();
  const formatDate = useDateTime();
  const wsId = useWorkspaceId();
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const key = directDraftKey(wsId, userId, otherId, sessionId);
  const text = useDirectDraftStore((s) => s.draft.texts[key] ?? "");
  const pending = useDirectDraftStore((s) => s.draft.pending[key] ?? EMPTY_PENDING);
  const { data: members } = useQuery(memberListOptions(wsId));
  const member = members?.find((m) => m.user_id === otherId);
  const name = member?.name || member?.email || t(($) => $.direct.former_member);
  const sendShortcut = useShortcut("send");
  const session = useQuery({ ...directSessionOptions(wsId, userId, sessionId), enabled: !creating });
  const scopeValid = creating || session.data?.peer_user_id === otherId;
  const query = useInfiniteQuery({ ...directMessagesOptions(wsId, userId, sessionId), enabled: !creating && scopeValid });
  const messages = useMemo(() => {
    const unique = new Map((query.data?.pages ?? []).flatMap((p) => p.messages).map((m) => [m.id, m]));
    return [...unique.values()].sort((a, b) => a.sequence - b.sequence);
  }, [query.data]);
  const latest = messages.at(-1)?.sequence ?? 0;
  const readSequence = query.data?.pages[0]?.read_sequence ?? 0;
  const canSend = !!member && otherId !== userId && scopeValid && (creating || query.data?.pages[0]?.can_send === true);
  const send = useSendDirectMessage(wsId, userId, otherId, sessionId, creating);
  const { mutate: markRead } = useMarkDirectMessagesRead(wsId, userId, sessionId);
  const foreground = useAppForeground();
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const lastReadAttempt = useRef(0);
  const acknowledged = useMemo(() => new Set(messages.map((m) => m.client_message_id)), [messages]);
  useEffect(() => {
    const first = messages.find((message) => message.sequence === 1 && message.sender_id === userId);
    if (creating && session.data?.peer_user_id === otherId && first)
      onCreated({ session: session.data, message: first });
  }, [creating, session.data, messages, userId, otherId, onCreated]);

  // An acknowledgement can arrive through WS before the POST round trip ends.
  useEffect(() => {
    for (const message of pending) {
      if (acknowledged.has(message.client_message_id)) {
        removePendingDirectMessage(key, message.client_message_id);
      }
    }
  }, [pending, acknowledged, key]);
  useEffect(() => {
    if (atBottom.current) scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight });
  }, [latest, pending.length]);
  useEffect(() => {
    if (!foreground || creating || !isAtBottom) {
      lastReadAttempt.current = 0;
      return;
    }
    if (latest > readSequence && latest > lastReadAttempt.current && !query.isFetching) {
      lastReadAttempt.current = latest;
      markRead(latest, { onError: () => { lastReadAttempt.current = 0; } });
    }
  }, [foreground, creating, isAtBottom, latest, readSequence, query.isFetching, markRead]);

  const submit = () => {
    if (!canSend || !text.trim() || send.isPending) return;
    send.mutate({ content: text, client_message_id: crypto.randomUUID() }, { onSuccess: creating ? onCreated : undefined });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader className="pl-12">
        {member ? <AppLink href={paths.memberDetail(otherId)} aria-label={name} className="flex min-w-0 items-center gap-2 hover:underline"><span aria-hidden="true">
          <ActorAvatar
            name={name}
            initials={name.charAt(0).toUpperCase()}
            avatarUrl={resolvePublicFileUrl(member?.avatar_url)}
            size="sm"
          />
        </span>
        <h1 className="min-w-0 truncate text-sm font-semibold">{name}</h1></AppLink> : <h1 className="min-w-0 truncate text-sm font-semibold">{name}</h1>}
        <span className="ml-auto text-xs text-muted-foreground">{t(($) => $.direct.private_label)}</span>
      </PageHeader>
      <div
        ref={scrollRef}
        role="log"
        aria-label={t(($) => $.direct.messages_label)}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          setIsAtBottom(atBottom.current);
        }}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {query.hasNextPage && (
            <Button
              variant="ghost"
              size="sm"
              disabled={query.isFetchingNextPage}
              onClick={async () => {
                const el = scrollRef.current;
                const height = el?.scrollHeight ?? 0;
                const top = el?.scrollTop ?? 0;
                await query.fetchNextPage();
                requestAnimationFrame(() => {
                  if (el) el.scrollTop = top + el.scrollHeight - height;
                });
              }}
            >
              {t(($) => $.message_list.load_older)}
            </Button>
          )}
          {!creating && query.isPending && (
            <p className="text-center text-sm text-muted-foreground">{t(($) => $.direct.loading)}</p>
          )}
          {(query.isError || session.isError || (!creating && session.isSuccess && !scopeValid)) && (
            <div role="alert" className="text-center">
              <p className="text-sm text-destructive">{t(($) => $.direct.load_failed)}</p>
              <Button variant="ghost" onClick={() => void (scopeValid ? query.refetch() : session.refetch())}>{t(($) => $.direct.retry)}</Button>
            </div>
          )}
          {(creating || !query.isPending) && !query.isError && messages.length === 0 && pending.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <MessageSquare aria-hidden="true" className="size-8" />
              <p className="text-sm">{t(($) => $.direct.empty, { name })}</p>
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              style={{ contentVisibility: "auto", containIntrinsicSize: "60px" }}
              className={message.sender_id === userId ? "flex justify-end" : "flex justify-start"}
            >
              <div className={message.sender_id === userId
                ? "max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground"
                : "max-w-[85%] rounded-xl rounded-bl-sm bg-muted px-3 py-2"}
              >
                <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                <time dateTime={message.created_at} className="mt-1 block text-[10px] opacity-70">
                  {formatDate(message.created_at)}
                </time>
              </div>
            </div>
          ))}
          {pending.filter((m) => !acknowledged.has(m.client_message_id)).map((message) => (
            <div key={message.client_message_id} className="flex flex-col items-end gap-1">
              <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                {message.content}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                {message.status === "sending" ? t(($) => $.direct.sending) : (
                  <>
                    <span className="text-destructive">{t(($) => $.direct.send_failed)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canSend || send.isPending}
                      onClick={() => send.mutate({
                        content: message.content, client_message_id: message.client_message_id,
                      }, { onSuccess: creating ? onCreated : undefined })}
                    >
                      {t(($) => $.direct.retry)}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <form className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 pb-4 pt-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="min-w-0 flex-1">
          {!canSend && !query.isPending && !query.isError && (
            <p className="mb-2 text-xs text-muted-foreground">{t(($) => $.direct.unavailable)}</p>
          )}
          <Textarea
            aria-label={t(($) => $.input.placeholder_named, { name })}
            placeholder={t(($) => $.input.placeholder_named, { name })}
            value={text}
            maxLength={20000}
            disabled={!canSend}
            onChange={(e) => setDirectDraft(key, e.target.value)}
            onKeyDown={(e) => {
              if (!e.nativeEvent.isComposing && shortcutMatchesEvent(sendShortcut, e.nativeEvent)) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-40 min-h-20 resize-none"
          />
        </div>
        <Button
          type="submit"
          size="icon"
          aria-label={t(($) => $.input.send_tooltip)}
          disabled={!canSend || !text.trim() || send.isPending}
        >
          <ArrowUp aria-hidden="true" className="size-4" />
        </Button>
      </form>
    </div>
  );
}
