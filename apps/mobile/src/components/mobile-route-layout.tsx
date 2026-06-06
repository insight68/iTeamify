import { useEffect } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { WorkspaceSlugProvider } from "@teamify/core/paths";
import {
  workspaceBySlugOptions,
  workspaceListOptions,
} from "@teamify/core/workspace";
import { setCurrentWorkspace } from "@teamify/core/platform";
import { useAuthStore } from "@teamify/core/auth";
import { useWorkspaceSeen } from "@teamify/views/workspace/use-workspace-seen";
import { WorkspacePresencePrefetch } from "@teamify/views/layout";

/**
 * Mobile equivalent of desktop's WorkspaceRouteLayout.
 * Resolves URL slug → workspace UUID and sets the platform singleton.
 */
export function MobileRouteLayout() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAuthLoading = useAuthStore((s) => s.isLoading);

  // Bounce to login if unauthenticated
  useEffect(() => {
    if (!isAuthLoading && !user) navigate("/login", { replace: true });
  }, [isAuthLoading, user, navigate]);

  const { data: workspace, isFetched: listFetched } = useQuery({
    ...workspaceBySlugOptions(workspaceSlug ?? ""),
    enabled: !!user && !!workspaceSlug,
  });

  const { data: wsList } = useQuery({
    ...workspaceListOptions(),
    enabled: !!user,
  });

  // Feed slug into platform singleton
  if (workspace && workspaceSlug) {
    setCurrentWorkspace(workspaceSlug, workspace.id);
  }

  const hasBeenSeen = useWorkspaceSeen(workspaceSlug, !!workspace);

  // Auto-heal: if slug doesn't resolve and workspace list is loaded,
  // redirect to first available workspace or onboarding
  useEffect(() => {
    if (!user) return;
    if (!listFetched) return;
    if (workspace) return;
    if (hasBeenSeen) return;
    if (!wsList || wsList.length === 0) return;

    // Redirect to the first valid workspace
    const firstSlug = wsList[0]!.slug;
    navigate(`/${firstSlug}/issues`, { replace: true });
  }, [user, listFetched, workspace, hasBeenSeen, wsList, navigate]);

  if (isAuthLoading) return null;
  if (!workspaceSlug) return null;
  if (!listFetched) return null;
  if (!workspace) return null;

  return (
    <WorkspaceSlugProvider slug={workspaceSlug}>
      <WorkspacePresencePrefetch />
      <Outlet />
    </WorkspaceSlugProvider>
  );
}
