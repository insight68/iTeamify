"use client";

import React from "react";
import {
  User,
  SlidersHorizontal,
  Key,
  Settings,
  Users,
  FolderGit2,
  Bell,
  Bot,
  Server,
  Download,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@teamify/ui/components/ui/tabs";
import { useCurrentWorkspace } from "@teamify/core/paths";
import { useIsOwner } from "@teamify/core/permissions";
import { useWorkspaceId } from "@teamify/core";
import { useNavigation } from "../../navigation";
import { AccountTab } from "./account-tab";
import { PreferencesTab } from "./preferences-tab";
import { TokensTab } from "./tokens-tab";
import { WorkspaceTab } from "./workspace-tab";
import { MembersTab } from "./members-tab";
import { RepositoriesTab } from "./repositories-tab";
import { NotificationsTab } from "./notifications-tab";
import { AgentsTab } from "./agents-tab";
import { ImportTab } from "./import-tab";
import { McpTab } from "./mcp-tab";
import { useT } from "../../i18n";

const ACCOUNT_TAB_KEYS = ["profile", "preferences", "notifications", "tokens"] as const;
const ACCOUNT_TAB_ICONS = {
  profile: User,
  preferences: SlidersHorizontal,
  notifications: Bell,
  tokens: Key,
} as const;

const BASE_WORKSPACE_TAB_KEYS = ["general", "repositories", "members", "agents", "mcp", "import"] as const;
const WORKSPACE_TAB_VALUES = {
  general: "workspace",
  repositories: "repositories",
  members: "members",
  agents: "agents",
  mcp: "mcp",
  import: "import",
} as const;
const WORKSPACE_TAB_ICONS = {
  general: Settings,
  repositories: FolderGit2,
  members: Users,
  agents: Bot,
  mcp: Server,
  import: Download,
} as const;

const DEFAULT_TAB = "profile";
const TAB_QUERY_KEY = "tab";

export interface ExtraSettingsTab {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  content: React.ReactNode;
  /** If true, this tab is only visible to workspace owners. */
  ownerOnly?: boolean;
}

interface SettingsPageProps {
  /** Additional tabs injected by platform (e.g. desktop daemon settings) */
  extraAccountTabs?: ExtraSettingsTab[];
}

export function SettingsPage({ extraAccountTabs }: SettingsPageProps = {}) {
  const { t } = useT("settings");
  const workspaceName = useCurrentWorkspace()?.name;
  const navigation = useNavigation();
  const wsId = useWorkspaceId();
  const { isOwner } = useIsOwner(wsId);

  // Tokens tab is owner-only — hide from non-owners.
  const visibleAccountKeys = React.useMemo(
    () => (isOwner ? ACCOUNT_TAB_KEYS : ACCOUNT_TAB_KEYS.filter((k) => k !== "tokens")),
    [isOwner],
  );

  // Filter extra tabs by ownership.
  const visibleExtraTabs = React.useMemo(
    () => extraAccountTabs?.filter((tab) => !tab.ownerOnly || isOwner) ?? [],
    [extraAccountTabs, isOwner],
  );

  // Repositories / MCP / Import tabs are owner-only — hide from non-owners.
  const visibleWorkspaceKeys = React.useMemo(
    () =>
      isOwner
        ? BASE_WORKSPACE_TAB_KEYS
        : BASE_WORKSPACE_TAB_KEYS.filter(
            (k) => k !== "repositories" && k !== "mcp" && k !== "import",
          ),
    [isOwner],
  );

  // Whitelist of valid tab values; unknown ?tab=… values silently fall back to
  // the default. Whitelisting also blocks junk like ?tab=<script> from
  // surfacing in the DOM via Radix Tabs internals.
  const validTabs = React.useMemo(
    () =>
      new Set<string>([
        ...visibleAccountKeys,
        ...visibleWorkspaceKeys.map((k) => WORKSPACE_TAB_VALUES[k]),
        ...(visibleExtraTabs?.map((tab) => tab.value) ?? []),
      ]),
    [visibleAccountKeys, visibleWorkspaceKeys, visibleExtraTabs],
  );

  const tabFromUrl = navigation.searchParams.get(TAB_QUERY_KEY);
  const activeTab =
    tabFromUrl && validTabs.has(tabFromUrl) ? tabFromUrl : DEFAULT_TAB;

  // replace (not push) so settings tab switches don't pollute browser history.
  // Preserve any other query params the page may carry.
  const handleTabChange = (next: string) => {
    const params = new URLSearchParams(navigation.searchParams);
    params.set(TAB_QUERY_KEY, next);
    navigation.replace(`${navigation.pathname}?${params.toString()}`);
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      orientation="vertical"
      className="flex-1 min-h-0 gap-0 flex flex-col md:flex-row md:overflow-hidden overflow-y-auto"
    >
      {/* Left nav (stacks on top on mobile, sidebar on md+) */}
      <div className="shrink-0 md:w-52 border-b md:border-b-0 md:border-r md:overflow-y-auto p-3 md:p-4">
        <h1 className="text-sm font-semibold mb-4 px-2">{t(($) => $.page.title)}</h1>
        <TabsList variant="line" className="flex-col items-stretch w-full">
          {/* My Account group */}
          <span className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
            {t(($) => $.page.my_account)}
          </span>
          {visibleAccountKeys.map((key) => {
            const Icon = ACCOUNT_TAB_ICONS[key];
            return (
              <TabsTrigger key={key} value={key}>
                <Icon className="h-4 w-4" />
                {t(($) => $.page.tabs[key])}
              </TabsTrigger>
            );
          })}
          {visibleExtraTabs?.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </TabsTrigger>
          ))}

          {/* Workspace group */}
          <span className="px-2 pb-1 pt-4 text-xs font-medium text-muted-foreground truncate">
            {workspaceName ?? t(($) => $.page.workspace_fallback)}
          </span>
          {visibleWorkspaceKeys.map((key) => {
            const Icon = WORKSPACE_TAB_ICONS[key];
            return (
              <TabsTrigger key={key} value={WORKSPACE_TAB_VALUES[key]}>
                <Icon className="h-4 w-4" />
                {t(($) => $.page.tabs[key])}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      {/* Right content */}
      <div className="flex-1 min-w-0 md:overflow-y-auto">
        <div className="w-full max-w-3xl mx-auto p-4 md:p-6">
          <TabsContent value="profile"><AccountTab /></TabsContent>
          <TabsContent value="preferences"><PreferencesTab /></TabsContent>
          <TabsContent value="notifications"><NotificationsTab /></TabsContent>
          <TabsContent value="tokens"><TokensTab /></TabsContent>
          <TabsContent value="workspace"><WorkspaceTab /></TabsContent>
          <TabsContent value="repositories"><RepositoriesTab /></TabsContent>
          <TabsContent value="members"><MembersTab /></TabsContent>
          <TabsContent value="agents"><AgentsTab /></TabsContent>
          <TabsContent value="mcp"><McpTab /></TabsContent>
          <TabsContent value="import"><ImportTab /></TabsContent>
          {visibleExtraTabs?.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>{tab.content}</TabsContent>
          ))}
        </div>
      </div>
    </Tabs>
  );
}
