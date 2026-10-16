"use client";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { teamActivityOptions } from "@iteamify/core/team";
import { useWorkspaceId } from "@iteamify/core/hooks";
import { useAuthStore } from "@iteamify/core/auth";
import { agentListOptions, memberListOptions } from "@iteamify/core/workspace/queries";
import { canInvokeAgent } from "@iteamify/core/permissions";
import { chatSessionsOptions, scopedAgentSessionsOptions, chatSessionOptions } from "@iteamify/core/chat/queries";
import { useSetChatSessionArchived } from "@iteamify/core/chat/mutations";
import { ContainerPicker } from "./session-containers/container-picker";
import { SessionContainerHost } from "./session-containers/container-host";
import { useIsMobile } from "@iteamify/ui/hooks/use-mobile";
import { Button } from "@iteamify/ui/components/ui/button";
import { useWorkspacePaths } from "@iteamify/core/paths";
import type { ChatSession } from "@iteamify/core/types";
import { PageHeader } from "../layout/page-header";
import { useNavigation } from "../navigation";
import { useT } from "../i18n";
import { DeferredChatMessageList as ChatMessageList } from "./components/deferred-chat-message-list";
import { ChatMessageSkeleton } from "./components/chat-message-skeleton";
import { ChatInput } from "./components/chat-input";
import { ChatThreadList } from "./components/chat-thread-list";
import { ChatSessionHeader } from "./components/chat-session-header";
import { EmptyState } from "./components/chat-empty-state";
import { NewChatButton } from "./components/new-chat-button";
import { useChatController } from "./components/use-chat-controller";
import { MemberChatPage } from "./member-chat-page";
import { OfflineBanner } from "./components/offline-banner";
import { NoAgentBanner } from "./components/no-agent-banner";
import { ArchivedAgentBanner } from "./components/archived-agent-banner";
import { ChatShell } from "./components/chat-shell";
export function ChatPage() {
    const { searchParams } = useNavigation();
    const memberId = searchParams.get("member");
    return memberId ? <MemberChatPage key={memberId} userId={memberId}/> : <AgentSessionPage key={searchParams.get("agent") ?? "global"}/>;
}
function AgentConversation() {
    const { t } = useT("chat");
    const { searchParams, replace } = useNavigation();
    const wsPaths = useWorkspacePaths();
    const isMobile = useIsMobile();
    const urlSession = searchParams.get("session") || null;
    const urlAgent = searchParams.get("agent") || null;
    const urlNew = searchParams.get("new");
    const opened = useRef(false);
    const agentRef = useRef(urlAgent);
    const navigateSession = useCallback((id: string | null) => {
        opened.current = true;
        const params = new URLSearchParams();
        if (urlAgent || (!id && agentRef.current))
            params.set("agent", urlAgent ?? agentRef.current!);
        if (id)
            params.set("session", id);
        else
            params.set("new", crypto.randomUUID());
        replace(`${wsPaths.chat()}?${params}`);
    }, [urlAgent, replace, wsPaths]);
    const navigateAgent = useCallback((id: string | null) => {
        opened.current = true;
        if (id)
            replace(`${wsPaths.chat()}?agent=${id}&new=${crypto.randomUUID()}`);
    }, [replace, wsPaths]);
    const startDraft = useCallback((agentId: string | null, projectId: string | null) => {
        opened.current = true;
        const params = new URLSearchParams({ new: crypto.randomUUID() });
        if (agentId) params.set("agent", agentId);
        if (projectId) params.set("project", projectId);
        replace(`${wsPaths.chat()}?${params}`);
    }, [replace, wsPaths]);
    const setDraftProject = useCallback((projectId: string | null) => {
        const params = new URLSearchParams(searchParams);
        if (projectId) params.set("project", projectId);
        else params.delete("project");
        replace(`${wsPaths.chat()}?${params}`);
    }, [searchParams, replace, wsPaths]);
    const c = useChatController({ isActive: true, agentScope: urlAgent, sessionStatus: "all", composeId: urlNew, draftKey: urlSession ?? `new:agent:${urlAgent ?? "global"}:${urlNew ?? "default"}`, selection: {
            sessionId: urlSession, agentId: urlAgent, projectId: searchParams.get("project"), onSessionChange: navigateSession, onAgentChange: navigateAgent,
            onProjectChange: setDraftProject, onStartNew: startDraft,
        } });
    agentRef.current = urlAgent ?? c.currentSession?.agent_id ?? c.activeAgent?.id ?? null;
    const handleDeleted = (id: string) => { if (id === urlSession) navigateSession(null); };
    const handleArchive = (session: ChatSession) => {
        if (session.id === urlSession) {
            const next = c.sessions.find((s) => s.id !== session.id && s.status === "active");
            navigateSession(next?.id ?? null);
        }
        c.archiveSession(session.id);
    };
    const changeProjectContext = (id: string | null) => c.handleProjectChange(id);
    const conversation = (<div className="flex flex-1 flex-col min-h-0">
      {c.currentSession && (<ChatSessionHeader session={c.currentSession} agent={c.activeAgent} onArchive={handleArchive} onDeleteSession={handleDeleted} className={!isMobile ? "pl-12" : undefined}/>)}
      {c.selectionError ? <p role="alert" className="p-4 text-sm text-destructive">{t(($) => $.direct.load_failed)}</p> : c.showSkeleton ? (<ChatMessageSkeleton />) : c.hasMessages ? (<ChatMessageList workspaceId={c.currentSession?.workspace_id} key={c.activeSessionId} messages={c.messages} pendingTask={c.pendingTask} availability={c.availability} firstItemIndex={c.firstItemIndex} hasOlderMessages={c.hasOlderMessages} isFetchingOlderMessages={c.isFetchingOlderMessages} onLoadOlderMessages={() => void c.fetchOlderMessages()} showTurnMinimap={!isMobile}/>) : (<EmptyState agent={c.activeAgent}/>)}

      {c.noAgent ? (<NoAgentBanner />) : c.isAgentArchived ? (<ArchivedAgentBanner agentName={c.activeAgent?.name}/>) : (<OfflineBanner agentName={c.activeAgent?.name} availability={c.availability}/>)}

      <ChatInput draftKeyOverride={urlSession ?? `new:agent:${urlAgent ?? "global"}:${searchParams.get("new") ?? "default"}`} editorKeyOverride={urlSession ?? searchParams.get("new") ?? urlAgent ?? "global"} onSend={c.handleSend} restoreDraftRequest={c.restoreDraftRequest} onRestoreDraftApplied={c.handleRestoreDraftApplied} uploadEnabled={c.uploadEnabled} onStop={c.handleStop} isRunning={!!c.pendingTaskId} disabled={c.isSessionArchived || c.isAgentArchived || c.selectionError || (!!urlSession && !c.currentSession)} noAgent={!c.activeAgent} agentArchived={c.isAgentArchived} agentName={c.activeAgent?.name} projects={c.projects} projectId={c.activeProjectId} projectContextUnsupported={c.projectContextUnsupported} onProjectChange={changeProjectContext} isProjectUpdating={c.isProjectUpdating} focusRequest={c.focusInputRequest}/>
    </div>);
    return conversation;
}

function AgentSessionPage() {
    const { t } = useT("chat");
    const { searchParams, replace } = useNavigation();
    const wsPaths = useWorkspacePaths();
    const wsId = useWorkspaceId();
    const user = useAuthStore((s) => s.user);
    const urlSession = searchParams.get("session");
    const urlAgent = searchParams.get("agent");
    const urlNew = searchParams.get("new");
    const [listView, setListView] = useState<"history" | "archived">("history");
    const global = useQuery({ ...chatSessionsOptions(wsId), enabled: !urlAgent });
    const scoped = useInfiniteQuery(scopedAgentSessionsOptions(wsId, user?.id ?? "", urlAgent ?? "", listView === "history" ? "active" : "archived"));
    const agentQuery = useQuery(agentListOptions(wsId));
    const memberQuery = useQuery(memberListOptions(wsId));
    const agents = agentQuery.data ?? [];
    const members = memberQuery.data ?? [];
    const activity = useQuery(teamActivityOptions(wsId, user?.id ?? ""));
    const selected = useQuery(chatSessionOptions(wsId, urlSession ?? ""));
    const sessions = useMemo(() => urlAgent ? scoped.data?.pages.flatMap((p) => p.sessions) ?? [] : global.data ?? [], [urlAgent, scoped.data, global.data]);
    const memberRole = members.find((m) => m.user_id === user?.id)?.role;
    const availableAgents = agents.filter((a) => !a.archived_at && canInvokeAgent(a, { userId: user?.id ?? null, role: memberRole === "owner" || memberRole === "admin" || memberRole === "member" ? memberRole : null }).allowed);
    const opened = useRef(false);
    const navigate = (id: string) => {
        opened.current = true;
        const params = new URLSearchParams();
        if (urlAgent) params.set("agent", urlAgent);
        params.set("session", id);
        replace(`${wsPaths.chat()}?${params}`);
    };
    const startNew = (agentId: string, type = "conversation") => {
        opened.current = true;
        setListView("history");
        replace(`${wsPaths.chat()}?agent=${agentId}&new=${crypto.randomUUID()}&container=${type}`);
    };
    useEffect(() => {
        if (opened.current || !urlAgent || urlSession || urlNew || searchParams.get("view") === "list" || !activity.isSuccess || !scoped.isSuccess || !agentQuery.isSuccess || !memberQuery.isSuccess) return;
        opened.current = true;
        const id = activity.data.find((contact) => contact.target_type === "agent" && contact.target_id === urlAgent)?.resume_session_id;
        const recent = id ?? sessions.find((s) => s.status === "active")?.id;
        replace(`${wsPaths.chat()}?agent=${urlAgent}&${recent ? `session=${recent}` : `new=${crypto.randomUUID()}`}`);
    }, [urlAgent, urlSession, urlNew, searchParams, activity.isSuccess, activity.data, scoped.isSuccess, agentQuery.isSuccess, memberQuery.isSuccess, sessions, replace, wsPaths]);
    const archived = useSetChatSessionArchived();
    const archive = (session: ChatSession) => {
        archived.mutate({ sessionId: session.id, archived: true }, { onSuccess: () => { if (urlSession === session.id) replace(`${wsPaths.chat()}?${urlAgent ? `agent=${urlAgent}&` : ""}view=list`); } });
    };
    const agentId = selected.data?.agent_id ?? urlAgent;
    const agent = agents.find((a) => a.id === agentId);
    const listTitle = urlAgent && agent ? t(($) => $.page.topics_with, { name: agent.name }) : t(($) => $.page.title);
    const listHeader = <PageHeader className="justify-between"><h1 className="truncate text-sm font-semibold" title={listTitle}>{listTitle}</h1>{urlAgent ? <ContainerPicker target={{ kind: "agent", id: urlAgent }} disabled={!availableAgents.some((a) => a.id === urlAgent)} onSelect={(type) => startNew(urlAgent, type)} /> : <NewChatButton agents={availableAgents} userId={user?.id} onStart={(a) => { if (a) startNew(a.id); }} side="bottom" />}</PageHeader>;
    const listBody = <div className="px-2 py-1">
      {(urlAgent ? scoped.isPending : global.isPending) && <ChatMessageSkeleton />}
      {(urlAgent ? scoped.isError : global.isError) && <Button variant="ghost" onClick={() => void (urlAgent ? scoped.refetch() : global.refetch())}>{t(($) => $.direct.retry)}</Button>}
      <ChatThreadList scoped={!!urlAgent} view={urlAgent ? listView : undefined} onViewChange={urlAgent ? setListView : undefined} sessions={sessions} agents={agents} activeSessionId={urlSession} onSelectSession={(s) => navigate(s.id)} onArchive={archive} onDeleteSession={(id) => { if (urlSession === id) replace(`${wsPaths.chat()}?${urlAgent ? `agent=${urlAgent}&` : ""}view=list`); }} />
      {urlAgent && scoped.hasNextPage && <Button variant="ghost" disabled={scoped.isFetchingNextPage} onClick={() => void scoped.fetchNextPage()}>{t(($) => $.message_list.load_older)}</Button>}
    </div>;
    const targetId = urlSession ?? urlNew;
    const scopeValid = !urlAgent || !selected.data || selected.data.agent_id === urlAgent;
    const content = targetId ? urlSession && selected.isPending ? <ChatMessageSkeleton /> : selected.isError || !scopeValid ? <p role="alert" className="p-4 text-sm text-destructive">{t(($) => $.direct.load_failed)}</p> : agentId ? <SessionContainerHost descriptor={urlSession ? selected.data?.container : { type: searchParams.get("container") ?? "conversation" }} target={{ kind: "agent", id: agentId, name: agent?.name ?? "" }} sessionId={targetId} creating={!urlSession} onCreated={navigate} conversation={() => <AgentConversation key={targetId} />} /> : null : null;
    return <ChatShell listHeader={listHeader} listBody={listBody} content={content} hasTarget={!!targetId} onBack={() => replace(urlAgent ? `${wsPaths.chat()}?agent=${urlAgent}&view=list` : wsPaths.chat())} />;
}
