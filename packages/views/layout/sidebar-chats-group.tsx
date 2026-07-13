"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { cn } from "@teamify/ui/lib/utils";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@teamify/ui/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@teamify/ui/components/ui/sidebar";
import { ActorAvatar } from "@teamify/ui/components/common/actor-avatar";
import { agentListOptions, memberListOptions } from "@teamify/core/workspace/queries";
import { chatSessionsOptions } from "@teamify/core/chat/queries";
import { useWorkspacePresenceMap } from "@teamify/core/agents/use-agent-presence";
import { canAssignAgentToIssue } from "@teamify/core/permissions";
import type { Agent } from "@teamify/core/types";
import { useNavigation } from "../navigation";
import { useWorkspacePaths } from "@teamify/core/paths";
import { useT } from "../i18n";

interface SidebarChatsGroupProps {
  wsId: string | undefined;
  userId: string | undefined;
}

const AVAILABILITY_ORDER: Record<string, number> = {
  online: 0,
  unstable: 1,
  offline: 2,
};

export function SidebarChatsGroup({ wsId, userId }: SidebarChatsGroupProps) {
  const { t } = useT("layout");

  const { data: agents } = useQuery({
    ...agentListOptions(wsId ?? ""),
    enabled: !!wsId,
  });
  const { data: members } = useQuery({
    ...memberListOptions(wsId ?? ""),
    enabled: !!wsId,
  });
  const { data: sessions } = useQuery({
    ...chatSessionsOptions(wsId ?? ""),
    enabled: !!wsId,
  });
  const { byAgent: presenceMap } = useWorkspacePresenceMap(wsId);

  const rawRole = members?.find((m) => m.user_id === userId)?.role;
  const memberRole =
    rawRole === "owner" || rawRole === "admin" || rawRole === "member"
      ? rawRole
      : null;

  // Filter agents by archive + visibility (same logic as ChatWindow)
  const availableAgents = useMemo(
    () =>
      (agents ?? []).filter(
        (a) =>
          !a.archived_at &&
          canAssignAgentToIssue(a, { userId: userId ?? null, role: memberRole })
            .allowed,
      ),
    [agents, userId, memberRole],
  );

  // Build unread set: agent IDs that have at least one unread session
  const unreadAgentIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions ?? []) {
      if (s.has_unread) set.add(s.agent_id);
    }
    return set;
  }, [sessions]);

  const unreadAgentCount = useMemo(() => {
    let count = 0;
    for (const agent of availableAgents) {
      if (unreadAgentIds.has(agent.id)) count++;
    }
    return count;
  }, [availableAgents, unreadAgentIds]);

  // Sort: online → unstable → offline, then by name
  const sortedAgents = useMemo(
    () =>
      [...availableAgents].sort((a, b) => {
        const pa = presenceMap.get(a.id);
        const pb = presenceMap.get(b.id);
        const oa = pa ? AVAILABILITY_ORDER[pa.availability] ?? 2 : 2;
        const ob = pb ? AVAILABILITY_ORDER[pb.availability] ?? 2 : 2;
        if (oa !== ob) return oa - ob;
        return a.name.localeCompare(b.name);
      }),
    [availableAgents, presenceMap],
  );

  const { push } = useNavigation();
  const p = useWorkspacePaths();

  const handleAgentClick = (agent: Agent) => {
    const agentSessions = (sessions ?? [])
      .filter((s) => s.agent_id === agent.id && s.status !== "archived")
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

    const latest = agentSessions[0];
    if (latest) {
      push(p.chatsWithSession(latest.id));
    } else {
      push(p.chatsWithAgent(agent.id));
    }
  };

  if (!wsId || availableAgents.length === 0) return null;

  return (
    <Collapsible defaultOpen>
      <SidebarGroup className="group/chats">
        <SidebarGroupLabel
          render={<CollapsibleTrigger />}
          className="group/trigger cursor-pointer hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
        >
          <span>{t(($) => $.sidebar.chats_group_label)}</span>
          <ChevronRight className="!size-3 ml-1 stroke-[2.5] transition-transform duration-200 group-data-[panel-open]/trigger:rotate-90" />
          {unreadAgentCount > 0 && (
            <span className="ml-auto flex size-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-medium leading-none text-brand-foreground">
              {unreadAgentCount > 9 ? "9+" : unreadAgentCount}
            </span>
          )}
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            {sortedAgents.length > 0 ? (
              <SidebarMenu className="gap-0.5">
                {sortedAgents.map((agent) => {
                  const presence = presenceMap.get(agent.id);
                  const isUnread = unreadAgentIds.has(agent.id);
                  return (
                    <SidebarMenuItem key={agent.id}>
                      <SidebarMenuButton
                        size="sm"
                        className={cn(
                          "text-muted-foreground hover:not-data-active:bg-sidebar-accent/70",
                          "hover:text-sidebar-accent-foreground",
                        )}
                        onClick={() => handleAgentClick(agent)}
                      >
                        <ActorAvatar
                          name={agent.name}
                          initials={agent.name.charAt(0).toUpperCase()}
                          avatarUrl={agent.avatar_url}
                          isAgent
                          size={16}
                        />
                        <span
                          className="min-w-0 flex-1 overflow-hidden whitespace-nowrap"
                          style={{
                            maskImage:
                              "linear-gradient(to right, black calc(100% - 12px), transparent)",
                            WebkitMaskImage:
                              "linear-gradient(to right, black calc(100% - 12px), transparent)",
                          }}
                        >
                          {agent.name}
                        </span>
                        {isUnread && (
                          <span className="ml-auto size-1.5 rounded-full bg-brand" />
                        )}
                        {presence && presence.availability !== "offline" && (
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              presence.availability === "online"
                                ? "bg-emerald-500"
                                : "bg-amber-500",
                            )}
                          />
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            ) : (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {t(($) => $.sidebar.chats_empty)}
              </p>
            )}
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
