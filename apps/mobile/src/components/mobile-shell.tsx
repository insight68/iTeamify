import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@teamify/core/api";
import { workspaceKeys } from "@teamify/core/workspace/queries";
import { MobileNavigationProvider } from "@/platform/navigation";
import { MobileRouteLayout } from "./mobile-route-layout";
import { BottomTabBar } from "./bottom-tab-bar";
import { MobileLoginPage } from "./mobile-login-page";
import { Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import { IssueDetailPage } from "../pages/issue-detail-page";
import { AgentDetailPage } from "../pages/agent-detail-page";
import { IssuesPage } from "@teamify/views/issues/components";
import { InboxPage } from "@teamify/views/inbox";
import { ChatPage } from "@teamify/views/chat";
import { AgentsPage } from "@teamify/views/agents";
import { SettingsPage } from "@teamify/views/settings";
import { InvitePage } from "@teamify/views/invite";
import { OnboardingFlow } from "@teamify/views/onboarding";
import { ErrorBoundary } from "@teamify/ui/components/common/error-boundary";

/** Route wrapper that extracts invitationId from URL params */
function InviteRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/login" replace />;
  return <InvitePage invitationId={id} />;
}

interface MobileShellProps {
  workspaces: { slug: string; id: string; name: string }[];
  workspaceListFetched: boolean;
  wsCount: number;
  hasOnboarded: boolean;
}

function ShellContent({
  workspaces,
  workspaceListFetched,
  wsCount,
  hasOnboarded,
}: MobileShellProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Pre-workspace routing: un-onboarded → invitations/onboarding, zero workspaces → create workspace
  useEffect(() => {
    if (!workspaceListFetched || wsCount > 0) return;

    const doNavigate = async () => {
      if (!hasOnboarded) {
        try {
          const invites = await api.listMyInvitations();
          if (invites.length > 0) {
            qc.setQueryData(workspaceKeys.myInvitations(), invites);
            navigate("/invitations");
          } else {
            navigate("/onboarding");
          }
        } catch {
          navigate("/onboarding");
        }
      } else {
        navigate("/onboarding");
      }
    };

    doNavigate();
  }, [workspaceListFetched, wsCount, hasOnboarded, qc, navigate]);

  return (
    <div className="flex h-screen flex-col">
      <div className="flex-1 overflow-hidden">
        <Routes>
          {/* Pre-workspace routes */}
          <Route path="/login" element={<MobileLoginPage />} />
          <Route path="/onboarding" element={<OnboardingFlow onComplete={() => {
            // After onboarding, redirect to the first workspace
            const wsList = qc.getQueryData(workspaceKeys.list()) as { slug: string }[] | undefined;
            if (wsList && wsList.length > 0) {
              navigate(`/${wsList[0]!.slug}/issues`);
            }
          }} />} />
          <Route path="/invitations" element={<div>Invitations</div>} />
          <Route path="/invite/:id" element={<InviteRoute />} />

          {/* Workspace-scoped routes */}
          <Route
            path="/:workspaceSlug"
            element={<MobileRouteLayout />}
          >
            <Route index element={<Navigate to="issues" replace />} />
            <Route
              path="issues"
              element={
                <ErrorBoundary>
                  <IssuesPage />
                </ErrorBoundary>
              }
            />
            <Route path="issues/:id" element={<IssueDetailPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route
              path="chats"
              element={
                <ErrorBoundary>
                  <ChatPage />
                </ErrorBoundary>
              }
            />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="agents/:id" element={<AgentDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Default: redirect to first workspace or onboarding */}
          <Route
            path="*"
            element={
              workspaces.length > 0 ? (
                <Navigate to={`/${workspaces[0]!.slug}/issues`} replace />
              ) : (
                <Navigate to="/onboarding" replace />
              )
            }
          />
        </Routes>
      </div>
      <BottomTabBar />
    </div>
  );
}

export function MobileShell(props: MobileShellProps) {
  return (
    <MobileNavigationProvider>
      <ShellContent {...props} />
    </MobileNavigationProvider>
  );
}
