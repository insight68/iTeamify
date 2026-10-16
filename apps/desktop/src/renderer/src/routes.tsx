import { lazy, Suspense, useEffect } from "react";
import { createMemoryRouter, Outlet, useMatches } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { IssueDetailPage } from "./pages/issue-detail-page";
import { ProjectDetailPage } from "./pages/project-detail-page";
import { AutopilotDetailPage } from "./pages/autopilot-detail-page";
import { SkillDetailPage } from "./pages/skill-detail-page";
import { AgentDetailPage } from "./pages/agent-detail-page";
import { MemberDetailPage } from "./pages/member-detail-page";
import {
  RuntimeDetailPage,
  RuntimeSettingsPage,
} from "./pages/runtime-detail-page";
import { AttachmentPreviewRoute } from "./pages/attachment-preview-page";



import { IssuesPage } from "@iteamify/views/issues/components/issues-page";
import { ProjectsPage } from "@iteamify/views/projects/components";
import { DashboardPage } from "@iteamify/views/dashboard";

import { AutopilotsPage } from "@iteamify/views/autopilots/components";
import { MyIssuesPage } from "@iteamify/views/my-issues";
import { SkillsPage } from "@iteamify/views/skills";
import { DesktopRuntimesPage } from "./components/desktop-runtimes-page";
import { DesktopAgentsPage } from "./components/desktop-agents-page";

import { SquadsPage, SquadDetailPage as SquadDetailPageView } from "@iteamify/views/squads/components";
import { InboxPage } from "@iteamify/views/inbox";
import { ChatPage } from "@iteamify/views/chat";
import { SettingsPage } from "@iteamify/views/settings";



import { CompanyPage } from "@iteamify/views/company";

import { useT } from "@iteamify/views/i18n";
import { Download, LoaderCircle, Server } from "lucide-react";
import { DaemonSettingsTab } from "./components/daemon-settings-tab";
import { UpdatesSettingsTab } from "./components/updates-settings-tab";
import { WorkspaceRouteLayout } from "./components/workspace-route-layout";
import { DesktopRouteErrorPage } from "./components/route-error-page";

const BillingPage = lazy(() => import("@iteamify/views/billing").then((m) => ({ default: m.BillingPage })));
const KnowledgePage = lazy(() => import("@iteamify/views/knowledge").then((m) => ({ default: m.KnowledgePage })));
const ApplicationsPage = lazy(() => import("@iteamify/views/applications").then((m) => ({ default: m.ApplicationsPage })));
const MembersPage = lazy(() => import("@iteamify/views/members").then((m) => ({ default: m.MembersPage })));
const ConnectionsPage = lazy(() => import("@iteamify/views/connections").then((m) => ({ default: m.ConnectionsPage })));
const RedditPage = lazy(() => import("@iteamify/views/connections").then((m) => ({ default: m.RedditPage })));
const AgentCreationStudio = lazy(() => import("@iteamify/views/agents").then((m) => ({ default: m.AgentCreationStudio })));

/**
 * Wraps `SettingsPage` so the desktop-only extra tabs can pull their labels
 * from i18n. The route element has to be a component (not a literal JSX
 * value) for `useT` to run.
 */
function DesktopSettingsRoute() {
  const { t } = useT("settings");
  return (
    <SettingsPage
      agentsContent={<DesktopAgentsPage />}
      extraAccountTabs={[
        {
          value: "daemon",
          label: "Daemon",
          icon: Server,
          content: <DaemonSettingsTab />,
        },
        {
          value: "updates",
          label: t(($) => $.desktop.tabs.updates),
          icon: Download,
          content: <UpdatesSettingsTab />,
        },
      ]}
    />
  );
}

/**
 * Sets document.title from the deepest matched route's handle.title.
 * The tab system observes document.title via MutationObserver.
 * Pages with dynamic titles (e.g. issue detail) override by setting
 * document.title directly via useDocumentTitle().
 */
function TitleSync() {
  const matches = useMatches();
  const title = [...matches]
    .reverse()
    .find((m) => (m.handle as { title?: string })?.title)
    ?.handle as { title?: string } | undefined;

  useEffect(() => {
    if (title?.title) document.title = title.title;
  }, [title?.title]);

  return null;
}

function RouteLoading() {
  const { t } = useT("common");
  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground" role="status">
      <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      <span className="sr-only">{t(($) => $.loading)}</span>
    </div>
  );
}

/** Wrapper that renders route children + TitleSync */
function PageShell() {
  return (
    <>
      <TitleSync />
      <Suspense fallback={<RouteLoading />}>
        <Outlet />
      </Suspense>
    </>
  );
}

/**
 * Route definitions shared by all tabs.
 *
 * Every tab path is workspace-scoped: `/{slug}/{route}/...`. Pre-workspace
 * flows (create workspace, accept invite) are NOT routes — they render as a
 * window-level overlay via `WindowOverlay`, dispatched by the navigation
 * adapter's transition-path interception. The `activeWorkspaceSlug` in the
 * tab store decides which workspace's tabs are visible in the TabBar;
 * workspace-less state (zero-workspace user) shows the overlay instead.
 *
 * The root index route stays as a harmless safety net. With per-workspace
 * tabs, nothing should construct a tab at `/` — but if one ever slips
 * through (malformed persisted state that dodges the migration, direct
 * router.navigate from unforeseen code), the index falls back to null
 * rather than 404; App.tsx's bootstrap repoints activeWorkspaceSlug on the
 * next render pass.
 */
export const appRoutes: RouteObject[] = [
  {
    element: <PageShell />,
    errorElement: <DesktopRouteErrorPage />,
    children: [
      { index: true, element: null },
      {
        path: ":workspaceSlug",
        element: <WorkspaceRouteLayout />,
        children: [
          { index: true, element: <CompanyPage />, handle: { title: "Company" } },
          {
            path: "issues",
            element: <IssuesPage />,
            handle: { title: "Issues" },
          },
          {
            path: "issues/:id",
            element: <IssueDetailPage />,
            handle: { title: "Issue" },
          },
          {
            path: "projects",
            element: <ProjectsPage />,
            handle: { title: "Projects" },
          },
          {
            path: "projects/:id",
            element: <ProjectDetailPage />,
            handle: { title: "Project" },
          },
          {
            path: "autopilots",
            element: <AutopilotsPage />,
            handle: { title: "Autopilot" },
          },
          {
            path: "autopilots/:id",
            element: <AutopilotDetailPage />,
            handle: { title: "Autopilot" },
          },
          {
            path: "knowledge",
            element: <KnowledgePage />,
            handle: { title: "Knowledge" },
          },
          {
            path: "business",
            // Safety net for a tab restored by an older client. Current tab
            // state is normalized to the Company root before routing.
            element: <CompanyPage />,
            handle: { title: "Company" },
          },
          {
            path: "my-issues",
            element: <MyIssuesPage />,
            handle: { title: "My Issues" },
          },
          {
            path: "runtimes",
            element: <DesktopRuntimesPage />,
            handle: { title: "Runtimes" },
          },
          {
            path: "runtimes/:id",
            element: <RuntimeDetailPage />,
            handle: { title: "Machine" },
          },
          {
            path: "runtimes/:id/runtime/:runtimeId",
            element: <RuntimeSettingsPage />,
            handle: { title: "Runtime" },
          },
          { path: "applications", element: <ApplicationsPage />, handle: { title: "Applications" } },
          { path: "members", element: <MembersPage />, handle: { title: "Members" } },
          { path: "skills", element: <SkillsPage />, handle: { title: "Skills" } },
          {
            path: "skills/:id",
            element: <SkillDetailPage />,
            handle: { title: "Skill" },
          },
          { path: "agents", element: <DesktopAgentsPage />, handle: { title: "Agents" } },
          { path: "agents/new", element: <AgentCreationStudio />, handle: { title: "Create Agent" } },
          {
            path: "agents/:id",
            element: <AgentDetailPage />,
            handle: { title: "Agent" },
          },
          {
            path: "members/:id",
            element: <MemberDetailPage />,
            handle: { title: "Member" },
          },
          { path: "squads", element: <SquadsPage />, handle: { title: "Squads" } },
          {
            path: "squads/:id",
            element: <SquadDetailPageView />,
            handle: { title: "Squad" },
          },
          { path: "inbox", element: <InboxPage />, handle: { title: "Inbox" } },
          { path: "chat", element: <ChatPage />, handle: { title: "Chat" } },
          {
            path: "attachments/:id/preview",
            element: <AttachmentPreviewRoute />,
            handle: { title: "Attachment" },
          },
          {
            path: "usage",
            element: <DashboardPage />,
            handle: { title: "Usage" },
          },
          {
            path: "billing",
            element: <BillingPage />,
            handle: { title: "Billing" },
          },
          {
            path: "settings",
            element: <DesktopSettingsRoute />,
            handle: { title: "Settings" },
          },
          { path: "connections/reddit", element: <RedditPage /> },
          {
            path: "connections",
            element: <ConnectionsPage />,
            handle: { title: "Connections" },
          },
        ],
      },
    ],
  },
];

/**
 * Create THE app router (MUL-4741 single-router session architecture).
 * There is exactly one instance, owned by the tab Coordinator; it projects
 * the active tab session's URL and is never navigated by anything else.
 */
export function createAppRouter() {
  return createMemoryRouter(appRoutes, {
    initialEntries: ["/"],
  });
}
