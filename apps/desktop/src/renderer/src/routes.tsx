import { Suspense, lazy, useEffect } from "react";
import {
  createMemoryRouter,
  Navigate,
  Outlet,
  useMatches,
} from "react-router-dom";
import type { RouteObject } from "react-router-dom";
// Page-level routes are lazy-loaded so the renderer's initial bundle no
// longer eagerly pulls every page (and its heavy transitive deps — TipTap,
// recharts, dnd-kit) at cold start. react-router renders the Suspense
// fallback in PageShell while a route's chunk loads. Named exports are
// adapted to the default export React.lazy expects.
const IssueDetailPage = lazy(() =>
  import("./pages/issue-detail-page").then((m) => ({ default: m.IssueDetailPage })),
);
const ProjectDetailPage = lazy(() =>
  import("./pages/project-detail-page").then((m) => ({ default: m.ProjectDetailPage })),
);
const AutopilotDetailPage = lazy(() =>
  import("./pages/autopilot-detail-page").then((m) => ({ default: m.AutopilotDetailPage })),
);
const SkillDetailPage = lazy(() =>
  import("./pages/skill-detail-page").then((m) => ({ default: m.SkillDetailPage })),
);
const AgentDetailPage = lazy(() =>
  import("./pages/agent-detail-page").then((m) => ({ default: m.AgentDetailPage })),
);
const RuntimeDetailPage = lazy(() =>
  import("./pages/runtime-detail-page").then((m) => ({ default: m.RuntimeDetailPage })),
);
const IssuesPage = lazy(() =>
  import("@teamify/views/issues/components").then((m) => ({ default: m.IssuesPage })),
);
const ProjectsPage = lazy(() =>
  import("@teamify/views/projects/components").then((m) => ({ default: m.ProjectsPage })),
);
const AutopilotsPage = lazy(() =>
  import("@teamify/views/autopilots/components").then((m) => ({ default: m.AutopilotsPage })),
);
const OrgPage = lazy(() =>
  import("@teamify/views/org").then((m) => ({ default: m.OrgPage })),
);
const DataSourcesPage = lazy(() =>
  import("@teamify/views/datasources").then((m) => ({ default: m.DataSourcesPage })),
);
const MyIssuesPage = lazy(() =>
  import("@teamify/views/my-issues").then((m) => ({ default: m.MyIssuesPage })),
);
const SkillsPage = lazy(() =>
  import("@teamify/views/skills").then((m) => ({ default: m.SkillsPage })),
);
const DesktopRuntimesPage = lazy(() =>
  import("./components/desktop-runtimes-page").then((m) => ({ default: m.DesktopRuntimesPage })),
);
const AgentsPage = lazy(() =>
  import("@teamify/views/agents").then((m) => ({ default: m.AgentsPage })),
);
const ChatPage = lazy(() =>
  import("@teamify/views/chat").then((m) => ({ default: m.ChatPage })),
);
const InboxPage = lazy(() =>
  import("@teamify/views/inbox").then((m) => ({ default: m.InboxPage })),
);
const SettingsPage = lazy(() =>
  import("@teamify/views/settings").then((m) => ({ default: m.SettingsPage })),
);
import { ErrorBoundary } from "@teamify/ui/components/common/error-boundary";
import { TeamifyIcon } from "@teamify/ui/components/common/teamify-icon";
import { captureException } from "@teamify/core/analytics";
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
      {/* Top-level backstop for every tab route. The narrower per-route
       *  <ErrorBoundary> wrappers (issues / chats) catch first; this ensures
       *  the ~12 routes without one (projects / agents / settings / inbox /
       *  org / …) degrade to a recoverable panel instead of blanking the tab.
       *  Desktop has no URL bar, so a white tab is unrecoverable without this. */}
      <ErrorBoundary
        onError={(error) =>
          captureException(error, { source: "desktop-route-error" })
        }
      >
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <TeamifyIcon className="size-6 animate-pulse" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </ErrorBoundary>
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
