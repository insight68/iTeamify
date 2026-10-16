"use client";

import React from "react";
import {
  User,
  SlidersHorizontal,
  Key,
  Users,
  FolderGit2,
  FlaskConical,
  Bell,
  Tags,
  Keyboard,
  ListTodo,
  Bot,
} from "lucide-react";
import { GitHubMark } from "./github-mark";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@iteamify/ui/components/ui/tabs";
import { useIsMobile } from "@iteamify/ui/hooks/use-mobile";
import { Spinner } from "@iteamify/ui/components/ui/spinner";
import { useCurrentWorkspace, useWorkspacePaths } from "@iteamify/core/paths";
import { useNavigation } from "../../navigation";
import { OpenAgentTab } from "./openagent-tab";
import { AccountTab } from "./account-tab";
import { PreferencesTab } from "./preferences-tab";
import { IssueTab } from "./issue-tab";
import { TokensTab } from "./tokens-tab";
import { MembersTab } from "./members-tab";
import { RepositoriesTab } from "./repositories-tab";
import { GitHubTab } from "./github-tab";
import { LabsTab } from "./labs-tab";
import { NotificationsTab } from "./notifications-tab";
import { LabelsTab } from "./labels-tab";
import { PropertiesTab } from "./properties-tab";
import { KeyboardShortcutsTab } from "./keyboard-shortcuts-tab";
import { useT } from "../../i18n";

const AgentsPage = React.lazy(() =>
  import("../../agents/components/agents-page").then((module) => ({ default: module.AgentsPage })),
);

const ACCOUNT_TAB_KEYS = ["profile", "preferences", "shortcuts", "issue", "notifications", "tokens"] as const;
const ACCOUNT_TAB_ICONS = {
  profile: User,
  preferences: SlidersHorizontal,
  shortcuts: Keyboard,
  issue: ListTodo,
  notifications: Bell,
  tokens: Key,
} as const;

const WORKSPACE_TAB_KEYS = [
  "repositories",
  "github",
  "labs",
  "agents",
  "openagent",
  "members",
  "labels",
  "properties",
] as const;
const WORKSPACE_TAB_VALUES = {
  repositories: "repositories",
  github: "github",
  labs: "labs",
  agents: "agents",
  openagent: "openagent",
  members: "members",
  labels: "labels",
  properties: "properties",
} as const;
const WORKSPACE_TAB_ICONS = {
  repositories: FolderGit2,
  github: GitHubMark,
  labs: FlaskConical,
  agents: Bot,
  openagent: Bot,
  members: Users,
  labels: Tags,
  properties: SlidersHorizontal,
} as const;

const DEFAULT_TAB = "profile";
const TAB_QUERY_KEY = "tab";
const HIDDEN_SETTINGS_NAV_TABS = new Set([
  "tokens",
  "repositories",
  "github",
  "labs",
]);

export function isSettingsTabVisibleInNavigation(tab: string) {
  return !HIDDEN_SETTINGS_NAV_TABS.has(tab);
}

const SETTINGS_TAB_TRIGGER_CLASS =
  "h-8 shrink-0 px-2.5 hover:bg-surface-hover data-active:!bg-surface-selected data-active:!text-surface-selected-foreground data-active:hover:!bg-surface-selected md:!w-full md:px-2 md:after:hidden";

export function resolveSettingsTab(tabFromUrl: string | null, validTabs: Set<string>) {
  return tabFromUrl && validTabs.has(tabFromUrl) ? tabFromUrl : DEFAULT_TAB;
}

export function resolveLegacyConnectionDestination(
  tabFromUrl: string | null,
  connectionsPath: string,
  currentSearchParams: URLSearchParams,
): string | null {
  if (tabFromUrl !== "integrations" && tabFromUrl !== "lark") return null;

  const params = new URLSearchParams(currentSearchParams);
  params.delete(TAB_QUERY_KEY);
  params.delete("view");
  const search = params.toString();
  const hash = tabFromUrl === "lark" ? "#feishu" : "";
  return `${connectionsPath}${search ? `?${search}` : ""}${hash}`;
}

export interface ExtraSettingsTab {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  content: React.ReactNode;
}

interface SettingsPageProps {
  /** Additional tabs injected by platform (e.g. desktop daemon settings) */
  extraAccountTabs?: ExtraSettingsTab[];
  /** Platform-specific agent page (e.g. desktop daemon wiring). */
  agentsContent?: React.ReactNode;
}

export function SettingsPage({ extraAccountTabs, agentsContent }: SettingsPageProps = {}) {
  const { t } = useT("settings");
  const { t: tLayout } = useT("layout");
  const workspaceName = useCurrentWorkspace()?.name;
  const workspacePaths = useWorkspacePaths();
  const navigation = useNavigation();
  const replace = navigation.replace;
  const isMobile = useIsMobile();

  // Whitelist of valid tab values; unknown ?tab=… values silently fall back to
  // the default. Whitelisting also blocks junk like ?tab=<script> from
  // surfacing in the DOM via Radix Tabs internals.
  const validTabs = React.useMemo(
    () =>
      new Set<string>([
        ...ACCOUNT_TAB_KEYS,
        ...Object.values(WORKSPACE_TAB_VALUES),
        ...(extraAccountTabs?.map((tab) => tab.value) ?? []),
      ]),
    [extraAccountTabs],
  );

  const tabFromUrl = navigation.searchParams.get(TAB_QUERY_KEY);
  const legacyDestination = resolveLegacyConnectionDestination(
    tabFromUrl,
    workspacePaths.connections(),
    navigation.searchParams,
  );
  const activeTab = resolveSettingsTab(tabFromUrl, validTabs);
  const isPageTab = activeTab === "agents";

  React.useEffect(() => {
    if (legacyDestination) replace(legacyDestination);
  }, [legacyDestination, replace]);

  // replace (not push) so settings tab switches don't pollute browser history.
  // Preserve any other query params the page may carry.
  const handleTabChange = (next: string) => {
    const params = new URLSearchParams(navigation.searchParams);
    params.set(TAB_QUERY_KEY, next);
    navigation.replace(`${navigation.pathname}?${params.toString()}`);
  };

  // Avoid flashing Profile while a legacy integrations deep link is replaced.
  if (legacyDestination) return null;

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      orientation={isMobile ? "horizontal" : "vertical"}
      className={`flex flex-1 min-h-0 flex-col gap-0 md:flex-row md:overflow-hidden ${isPageTab ? "overflow-hidden" : "overflow-y-auto"}`}
    >
      {/* Structural navigation; bounded setting groups remain in the content surface.
          Stays on the content surface color (no shell tint): the desktop's active
          tab merges into the card top, and a tinted panel under the first tabs
          breaks that seam (MUL-4439). Zoning comes from the divider instead. */}
      <div className="shrink-0 overflow-x-auto border-b border-surface-border p-2 md:w-56 md:overflow-y-auto md:border-b-0 md:border-r md:p-4">
        <h1 className="sr-only text-sm font-semibold md:not-sr-only md:mb-4 md:px-2">{t(($) => $.page.title)}</h1>
        <TabsList
          variant="line"
          className="flex w-max min-w-full flex-row items-center gap-1 p-0 md:w-full md:flex-col md:items-stretch"
        >
          {/* My Account group */}
          <span className="hidden px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground md:block">
            {t(($) => $.page.my_account)}
          </span>
          {ACCOUNT_TAB_KEYS.filter(isSettingsTabVisibleInNavigation).map((key) => {
            const Icon = ACCOUNT_TAB_ICONS[key];
            return (
              <TabsTrigger
                key={key}
                value={key}
                className={SETTINGS_TAB_TRIGGER_CLASS}
              >
                <Icon className="h-4 w-4" />
                {t(($) => $.page.tabs[key])}
              </TabsTrigger>
            );
          })}
          {extraAccountTabs?.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={SETTINGS_TAB_TRIGGER_CLASS}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </TabsTrigger>
          ))}

          {/* Workspace group */}
          <span className="hidden truncate px-2 pb-1 pt-4 text-xs font-medium text-muted-foreground md:block">
            {workspaceName ?? t(($) => $.page.workspace_fallback)}
          </span>
          {WORKSPACE_TAB_KEYS.filter(isSettingsTabVisibleInNavigation).map((key) => {
            const Icon = WORKSPACE_TAB_ICONS[key];
            return (
              <TabsTrigger
                key={key}
                value={WORKSPACE_TAB_VALUES[key]}
                className={SETTINGS_TAB_TRIGGER_CLASS}
              >
                <Icon className="h-4 w-4" />
                {key === "agents"
                  ? tLayout(($) => $.nav.agents)
                  : t(($) => $.page.tabs[key])}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      {/* Right content */}
      <div className={`min-w-0 flex-1 ${isPageTab ? "flex min-h-0 flex-col overflow-hidden" : "md:overflow-y-auto"}`}>
        <React.Suspense fallback={
          <div className="flex flex-1 items-center justify-center p-8"><Spinner /></div>
        }>
          <TabsContent value="agents" className="flex min-h-0 flex-col">
            {agentsContent ?? <AgentsPage />}
          </TabsContent>
        </React.Suspense>
        {!isPageTab && (
          <div className={`mx-auto w-full p-4 sm:p-6 md:p-8 ${activeTab === "labels" || activeTab === "properties" ? "max-w-5xl" : "max-w-3xl"}`}>
            <TabsContent value="profile"><AccountTab /></TabsContent>
            <TabsContent value="preferences"><PreferencesTab /></TabsContent>
            <TabsContent value="shortcuts"><KeyboardShortcutsTab /></TabsContent>
            <TabsContent value="issue"><IssueTab /></TabsContent>
            <TabsContent value="notifications"><NotificationsTab /></TabsContent>
            <TabsContent value="tokens"><TokensTab /></TabsContent>
            <TabsContent value="repositories"><RepositoriesTab /></TabsContent>
            <TabsContent value="github"><GitHubTab /></TabsContent>
            <TabsContent value="labs"><LabsTab /></TabsContent>
            <TabsContent value="openagent"><OpenAgentTab /></TabsContent>
            <TabsContent value="members"><MembersTab /></TabsContent>
            <TabsContent value="labels"><LabelsTab /></TabsContent>
            <TabsContent value="properties"><PropertiesTab /></TabsContent>
            {extraAccountTabs?.map((tab) => (
              <TabsContent key={tab.value} value={tab.value}>{tab.content}</TabsContent>
            ))}
          </div>
        )}
      </div>
    </Tabs>
  );
}
