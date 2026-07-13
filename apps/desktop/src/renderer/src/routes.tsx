import { useEffect } from "react";
import {
  createMemoryRouter,
  Navigate,
  Outlet,
  useMatches,
} from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { IssueDetailPage } from "./pages/issue-detail-page";
import { ProjectDetailPage } from "./pages/project-detail-page";
import { AutopilotDetailPage } from "./pages/autopilot-detail-page";
import { SkillDetailPage } from "./pages/skill-detail-page";
import { AgentDetailPage } from "./pages/agent-detail-page";
import { RuntimeDetailPage } from "./pages/runtime-detail-page";
import { ReconciliationDetailPage } from "./pages/reconciliation-detail-page";
import { IssuesPage } from "@teamify/views/issues/components";
import { ProjectsPage } from "@teamify/views/projects/components";
import { AutopilotsPage } from "@teamify/views/autopilots/components";
import { ReconciliationPage } from "@teamify/views/reconciliation";
import { InventoryPage } from "@teamify/views/inventory";
import { OrgPage } from "@teamify/views/org";
import { DataSourcesPage } from "@teamify/views/datasources";
import { MyIssuesPage } from "@teamify/views/my-issues";
import { SkillsPage } from "@teamify/views/skills";
import { DesktopRuntimesPage } from "./components/desktop-runtimes-page";
import { AgentsPage } from "@teamify/views/agents";
import { ChatPage } from "@teamify/views/chat";
import { InboxPage } from "@teamify/views/inbox";
import { SettingsPage } from "@teamify/views/settings";
import { ErrorBoundary } from "@teamify/ui/components/common/error-boundary";
import { Download, Server } from "lucide-react";
import { DaemonSettingsTab } from "./components/daemon-settings-tab";
import { UpdatesSettingsTab } from "./components/updates-settings-tab";
import { WorkspaceRouteLayout } from "./components/workspace-route-layout";
import { OwnerGuard } from "@teamify/views/layout";

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

/** Wrapper that renders route children + TitleSync */
function PageShell() {
  return (
    <>
      <TitleSync />
      <Outlet />
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
    children: [
      { index: true, element: null },
      {
        path: ":workspaceSlug",
        element: <WorkspaceRouteLayout />,
        children: [
          { index: true, element: <Navigate to="issues" replace /> },
          {
            path: "issues",
            element: (
              <ErrorBoundary>
                <IssuesPage />
              </ErrorBoundary>
            ),
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
            path: "reconciliation",
            element: <ErrorBoundary><ReconciliationPage /></ErrorBoundary>,
            handle: { title: "Reconciliation" },
          },
          {
            path: "inventory",
            element: <ErrorBoundary><InventoryPage /></ErrorBoundary>,
            handle: { title: "Inventory allocation" },
          },
          {
            path: "reconciliation/:batchNo",
            element: <ErrorBoundary><ReconciliationDetailPage /></ErrorBoundary>,
            handle: { title: "Reconciliation" },
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
            path: "org",
            element: <OwnerGuard><OrgPage /></OwnerGuard>,
            handle: { title: "Org" },
          },
          {
            path: "datasources",
            element: <OwnerGuard><DataSourcesPage /></OwnerGuard>,
            handle: { title: "Data Sources" },
          },
          {
            path: "autopilots/:id",
            element: <AutopilotDetailPage />,
            handle: { title: "Autopilot" },
          },
          {
            path: "my-issues",
            element: <MyIssuesPage />,
            handle: { title: "My Issues" },
          },
          {
            path: "runtimes",
            element: <OwnerGuard><DesktopRuntimesPage /></OwnerGuard>,
            handle: { title: "Runtimes" },
          },
          {
            path: "runtimes/:id",
            element: <OwnerGuard><RuntimeDetailPage /></OwnerGuard>,
            handle: { title: "Runtime" },
          },
          { path: "skills", element: <OwnerGuard><SkillsPage /></OwnerGuard>, handle: { title: "Skills" } },
          {
            path: "skills/:id",
            element: <OwnerGuard><SkillDetailPage /></OwnerGuard>,
            handle: { title: "Skill" },
          },
          { path: "agents", element: <OwnerGuard><AgentsPage /></OwnerGuard>, handle: { title: "Agents" } },
          { path: "chats", element: <ErrorBoundary><ChatPage /></ErrorBoundary>, handle: { title: "Chats" } },
          {
            path: "agents/:id",
            element: <OwnerGuard><AgentDetailPage /></OwnerGuard>,
            handle: { title: "Agent" },
          },
          { path: "inbox", element: <InboxPage />, handle: { title: "Inbox" } },
          {
            path: "settings",
            element: (
              <SettingsPage
                extraAccountTabs={[
                  {
                    value: "daemon",
                    label: "Daemon",
                    icon: Server,
                    content: <DaemonSettingsTab />,
                    ownerOnly: true,
                  },
                  {
                    value: "updates",
                    label: "Updates",
                    icon: Download,
                    content: <UpdatesSettingsTab />,
                  },
                ]}
              />
            ),
            handle: { title: "Settings" },
          },
        ],
      },
    ],
  },
];

/** Create an independent memory router for a tab. */
export function createTabRouter(initialPath: string) {
  return createMemoryRouter(appRoutes, {
    initialEntries: [initialPath],
  });
}
