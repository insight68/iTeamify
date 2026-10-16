"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessageSquare } from "lucide-react";
import { useAuthStore } from "@iteamify/core/auth";
import { useCurrentWorkspace, useWorkspacePaths } from "@iteamify/core/paths";
import { agentListOptions, memberListOptions } from "@iteamify/core/workspace/queries";
import { resolvePublicFileUrl } from "@iteamify/core/workspace/avatar-url";
import { chatSessionOptions } from "@iteamify/core/chat/queries";
import { buildTeamContacts, teamActivityOptions } from "@iteamify/core/team";
import type { Agent, MemberWithUser } from "@iteamify/core/types";
import type { TeamActivity } from "@iteamify/core/team";
import { ActorAvatar } from "@iteamify/ui/components/common/actor-avatar";
import { Input } from "@iteamify/ui/components/ui/input";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@iteamify/ui/components/ui/collapsible";
import {
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction,
} from "@iteamify/ui/components/ui/sidebar";
import { AppLink, useNavigation } from "../navigation";
import { useT } from "../i18n";

const EMPTY_MEMBERS: MemberWithUser[] = [];
const EMPTY_AGENTS: Agent[] = [];
const EMPTY_ACTIVITY: TeamActivity[] = [];
// Stable projections let Query structural sharing ignore status/updated_at
// changes that do not affect a contact's display or invocation permissions.
const selectMembers = (members: MemberWithUser[]) => members.map(
  ({ user_id, name, email, avatar_url, role, profile_description }) => ({
    user_id, name: name || email, avatar_url, role, profile_description,
  }),
);
const selectAgents = (agents: Agent[]) => agents.map(
  ({ id, name, description, avatar_url, archived_at, owner_id, permission_mode, invocation_targets }) =>
    ({ id, name, description, avatar_url, archived_at, owner_id, permission_mode, invocation_targets }),
);
const selectSessionAgent = (session: { agent_id: string }) => session.agent_id;
const rowClass = "text-muted-foreground hover:not-data-active:bg-sidebar-accent/70 data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground";

export function TeamSidebarGroup() {
  const { t } = useT("layout");
  const ws = useCurrentWorkspace();
  const wsId = ws?.id ?? "";
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const paths = useWorkspacePaths();
  const { pathname, searchParams } = useNavigation();
  const [search, setSearch] = useState("");
  const membersQuery = useQuery({
    ...memberListOptions(wsId), enabled: !!wsId, select: selectMembers,
  });
  const agentsQuery = useQuery({
    ...agentListOptions(wsId), enabled: !!wsId, select: selectAgents,
  });
  const activityQuery = useQuery(teamActivityOptions(wsId, userId ?? ""));
  const activity = activityQuery.data ?? EMPTY_ACTIVITY;
  const sessionId = pathname === paths.chat() ? searchParams.get("session") : null;
  const { data: sessionAgentId } = useQuery({
    ...chatSessionOptions(wsId, sessionId ?? ""),
    enabled: !!wsId && !!sessionId && !searchParams.get("agent") && !searchParams.get("member"),
    select: selectSessionAgent,
  });
  const contacts = useMemo(() => buildTeamContacts(
    membersQuery.data ?? EMPTY_MEMBERS,
    agentsQuery.data ?? EMPTY_AGENTS,
    activity, userId,
  ), [membersQuery.data, agentsQuery.data, activity, userId]);
  const filtered = useMemo(() => {
    const term = search.toLocaleLowerCase();
    return contacts.filter((c) => c.name.toLocaleLowerCase().includes(term));
  }, [contacts, search]);
  const memberId = pathname === paths.chat() ? searchParams.get("member") : null;
  const agentId = pathname === paths.chat() ? searchParams.get("agent") : null;

  return (
    <Collapsible defaultOpen>
      <SidebarGroup>
        <SidebarGroupLabel render={<CollapsibleTrigger />} className="group/trigger cursor-pointer hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground">
          <span>{t(($) => $.sidebar.team_group)}</span>
          <ChevronRight aria-hidden="true" className="!size-3 ml-1 transition-transform group-data-[panel-open]/trigger:rotate-90 motion-reduce:transition-none" />
          <span className="ml-auto text-[10px] text-muted-foreground">{contacts.length}</span>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            {contacts.length > 20 && (
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t(($) => $.sidebar.team_search)}
                placeholder={t(($) => $.sidebar.team_search)}
                className="mb-2 h-7 text-xs"
              />
            )}
            <SidebarMenu className={contacts.length > 20 ? "max-h-80 gap-0.5 overflow-y-auto overscroll-contain" : "gap-0.5"}>
              {filtered.map((contact) => {
                const active = contact.type === "member"
                  ? memberId === contact.id
                  : !memberId && (
                    agentId === contact.id || sessionAgentId === contact.id ||
                    (!!sessionId && contact.resume_session_id === sessionId)
                  );
                const href = contact.type === "member"
                  ? `${paths.chat()}?member=${contact.id}&view=list`
                  : active ? `${paths.chat()}?${searchParams}`
                    : `${paths.chat()}?agent=${contact.id}${contact.resume_session_id ? `&session=${contact.resume_session_id}` : ""}`;
                return (
                  <SidebarMenuItem key={`${contact.type}:${contact.id}`} style={contacts.length > 50 ? { contentVisibility: "auto", containIntrinsicSize: "56px" } : undefined}>
                    <SidebarMenuButton render={<AppLink href={href} />} isActive={active || (contact.type === "member" && pathname === paths.memberDetail(contact.id))} className={`${rowClass} h-14 ${contact.type === "member" ? "pr-9" : ""}`} title={contact.name}>
                      <span aria-hidden="true" className="shrink-0">
                        <ActorAvatar
                          name={contact.name}
                          initials={contact.name.charAt(0).toUpperCase()}
                          avatarUrl={resolvePublicFileUrl(contact.avatar_url)}
                          isAgent={contact.type === "agent"}
                          size="xl"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1">
                          <span className="truncate">{contact.name}</span>
                          {contact.type === "agent" && (
                            <span className="shrink-0 rounded border border-sidebar-border px-1 text-[9px] leading-4 text-muted-foreground">AI</span>
                          )}
                        </span>
                        {contact.description && (
                          <span className="block truncate text-xs leading-4 text-muted-foreground" title={contact.description}>
                            {contact.description}
                          </span>
                        )}
                      </span>
                      {contact.has_unread && (
                        <span
                          role="img"
                          aria-label={t(($) => $.sidebar.team_unread)}
                          className="size-1.5 shrink-0 rounded-full bg-brand"
                        />
                      )}
                    </SidebarMenuButton>
                    {contact.type === "member" && <SidebarMenuAction render={<AppLink href={href} />} aria-label={t(($) => $.sidebar.team_message, { name: contact.name })} title={t(($) => $.sidebar.team_message, { name: contact.name })} className="top-4"><MessageSquare /></SidebarMenuAction>}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
            {(membersQuery.isError || agentsQuery.isError || activityQuery.isError) && (
              <button
                type="button"
                className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  void membersQuery.refetch();
                  void agentsQuery.refetch();
                  void activityQuery.refetch();
                }}
              >
                {t(($) => $.sidebar.team_retry)}
              </button>
            )}
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
