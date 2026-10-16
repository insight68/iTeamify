"use client";

import { useState } from "react";
import { ChevronRight, UserRound, MessageSquare, Bot } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { MemberRole } from "@iteamify/core/types";
import { useWorkspaceId } from "@iteamify/core/hooks";
import { useCurrentWorkspace, useWorkspacePaths } from "@iteamify/core/paths";
import { memberListOptions, agentListOptions } from "@iteamify/core/workspace/queries";
import { useCurrentMember } from "@iteamify/core/permissions";
import { resolvePublicFileUrl } from "@iteamify/core/workspace/avatar-url";
import { ActorAvatar as ActorAvatarBase } from "@iteamify/ui/components/common/actor-avatar";
import { Skeleton } from "@iteamify/ui/components/ui/skeleton";
import { Button, buttonVariants } from "@iteamify/ui/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@iteamify/ui/components/ui/tabs";
import { PageHeader } from "../layout/page-header";
import { WorkspaceAvatar } from "../workspace/workspace-avatar";
import { ActorIssuesPanel } from "../common/actor-issues-panel";
import { AppLink, useNavigation } from "../navigation";
import { useT, useDateTime } from "../i18n";
import { MemberActions } from "./member-actions";
import { MemberApplicationsPanel } from "./member-applications-panel";

export function MemberDetailPage({ userId }: { userId: string }) {
  const { t } = useT("members");
  const wsId = useWorkspaceId();
  const workspace = useCurrentWorkspace();
  const paths = useWorkspacePaths();
  const navigation = useNavigation();
  const current = useCurrentMember(wsId);
  const formatDate = useDateTime();
  const [tab, setTab] = useState("tasks");
  const { data: members = [], isLoading, isError, refetch } = useQuery(memberListOptions(wsId));
  const agents = useQuery({ ...agentListOptions(wsId), enabled: tab === "agents" });
  const member = members.find((m) => m.user_id === userId) ?? null;
  const ownedAgents = (agents.data ?? []).filter((agent) => agent.owner_id === userId && !agent.archived_at);

  if (isLoading && !member) {
    return <MemberDetailSkeleton />;
  }

  if (isError || !member) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        <MemberBreadcrumb workspaceName={workspace?.name} workspaceAvatarUrl={workspace?.avatar_url} title={t(($) => $.detail.breadcrumb_fallback)} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <UserRound className="h-8 w-8 text-muted-foreground" />
          <div>
            <p role={isError ? "alert" : undefined} className="text-sm font-medium">{isError ? t(($) => $.list.load_failed) : t(($) => $.detail.not_found_title)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isError ? t(($) => $.list.retry) : t(($) => $.detail.not_found_description)}
            </p>
          </div>
          {isError && <Button variant="outline" onClick={() => void refetch()}>{t(($) => $.list.retry)}</Button>}
        </div>
      </div>
    );
  }

  const name = member.name || member.email;
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <MemberBreadcrumb workspaceName={workspace?.name} workspaceAvatarUrl={workspace?.avatar_url} title={name} />

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-5 sm:px-6">
        <ActorAvatarBase
          name={name}
          initials={initials}
          avatarUrl={resolvePublicFileUrl(member.avatar_url)}
          size="xl"
          className="rounded-full"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-base font-semibold">{name}</h1>
            <RoleBadge role={member.role} />
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {member.email}
          </p>
          {member.profile_description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{member.profile_description}</p>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {current.userId !== userId && <AppLink className={buttonVariants({ variant: "outline", size: "sm" })} href={`${paths.chat()}?member=${encodeURIComponent(userId)}&view=list`}><MessageSquare className="size-4" />{t(($) => $.detail.message)}</AppLink>}
          <MemberActions member={member} wsId={wsId} workspaceName={workspace?.name ?? ""} ownerCount={members.filter((entry) => entry.role === "owner").length} onRemoved={() => navigation.push(paths.members())} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
          <TabsList className="h-11 w-full shrink-0 justify-start rounded-none border-b bg-transparent px-4 sm:px-6">
            <TabsTrigger value="tasks">{t(($) => $.detail.tasks)}</TabsTrigger><TabsTrigger value="agents">{t(($) => $.detail.agents)}</TabsTrigger><TabsTrigger value="applications">{t(($) => $.detail.applications)}</TabsTrigger>
          </TabsList>
          <TabsContent value="tasks" className="flex min-h-0 flex-1 flex-col"><ActorIssuesPanel actorType="member" actorId={userId} /></TabsContent>
          <TabsContent value="agents" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {agents.isPending ? <p role="status" className="text-sm text-muted-foreground">{t(($) => $.list.loading)}</p> : agents.isError ? <div role="alert"><p className="text-sm">{t(($) => $.list.load_failed)}</p><Button variant="outline" className="mt-3" onClick={() => void agents.refetch()}>{t(($) => $.list.retry)}</Button></div> : ownedAgents.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t(($) => $.detail.no_agents)}</p> : <ul className="max-w-3xl divide-y rounded-lg border">{ownedAgents.map((agent) => <li key={agent.id}><AppLink href={paths.agentDetail(agent.id)} className="flex items-center gap-3 p-4 hover:bg-muted/50"><Bot className="size-5 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="truncate text-sm font-medium">{agent.name}</p>{agent.description && <p className="mt-1 truncate text-xs text-muted-foreground">{agent.description}</p>}</div><ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" /></AppLink></li>)}</ul>}
          </TabsContent>
          <TabsContent value="applications" className="min-h-0 flex-1 overflow-y-auto"><MemberApplicationsPanel key={userId} wsId={wsId} userId={userId} name={name} /></TabsContent>
        </Tabs>
        <aside className="shrink-0 border-t p-4 sm:p-6 lg:w-64 lg:border-l lg:border-t-0"><h2 className="text-xs font-medium text-muted-foreground">{t(($) => $.detail.membership)}</h2><dl className="mt-4 grid grid-cols-2 gap-4 text-sm lg:block lg:space-y-4"><div><dt className="text-xs text-muted-foreground">{t(($) => $.list.role)}</dt><dd className="mt-1"><RoleBadge role={member.role} /></dd></div><div><dt className="text-xs text-muted-foreground">{t(($) => $.list.joined)}</dt><dd className="mt-1 text-xs">{formatDate(member.created_at)}</dd></div><div className="col-span-2"><dt className="text-xs text-muted-foreground">{t(($) => $.list.email)}</dt><dd className="mt-1 break-all text-xs">{member.email}</dd></div></dl></aside>
      </div>
    </div>
  );
}

function MemberBreadcrumb({
  workspaceName,
  workspaceAvatarUrl,
  title,
}: {
  workspaceName: string | undefined;
  workspaceAvatarUrl?: string | null;
  title: string;
}) {
  const { t } = useT("members");
  const paths = useWorkspacePaths();
  return (
    <PageHeader className="gap-1.5">
      <AppLink href={paths.root()} aria-label={workspaceName ?? t(($) => $.detail.workspace_fallback)} className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <WorkspaceAvatar name={workspaceName ?? "W"} avatarUrl={workspaceAvatarUrl} size="sm" />
      <span className="truncate">
        {workspaceName ?? t(($) => $.detail.workspace_fallback)}
      </span>
      </AppLink>
      <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground" />
      <AppLink href={paths.members()} className="text-sm text-muted-foreground hover:text-foreground">
        {t(($) => $.detail.members_breadcrumb)}
      </AppLink>
      <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span aria-current="page" className="truncate text-sm font-medium">{title}</span>
    </PageHeader>
  );
}

function RoleBadge({ role }: { role: MemberRole }) {
  const { t } = useT("members");
  return (
    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {role === "owner"
        ? t(($) => $.role.owner)
        : role === "admin"
          ? t(($) => $.role.admin)
          : t(($) => $.role.member)}
    </span>
  );
}

function MemberDetailSkeleton() {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <PageHeader className="px-5">
        <Skeleton className="h-5 w-52" />
      </PageHeader>
      <div className="flex shrink-0 items-center gap-3 border-b px-6 py-4">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <div className="flex flex-1 min-h-0 gap-4 overflow-hidden p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex min-w-52 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
