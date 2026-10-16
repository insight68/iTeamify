"use client";

import { use, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { WorkspaceSlugProvider, paths } from "@iteamify/core/paths";
import { workspaceBySlugOptions } from "@iteamify/core/workspace";
import { setCurrentWorkspace } from "@iteamify/core/platform";
import { useAuthStore } from "@iteamify/core/auth";
import { NoAccessPage } from "@iteamify/views/workspace/no-access-page";
import { OnboardingSetupBanner } from "@iteamify/views/workspace/onboarding-setup-banner";
import { ITeamifyIcon } from "@iteamify/ui/components/common/iteamify-icon";
import { useWorkspaceSeen } from "@iteamify/views/workspace/use-workspace-seen";

export function WorkspaceLayoutClient({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = use(params);
  const user = useAuthStore((s) => s.user);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthLoading && !user) router.replace(paths.login());
  }, [isAuthLoading, user, router]);

  useEffect(() => {
    if (user && user.onboarded_at == null) {
      router.replace(paths.onboarding());
    }
  }, [user, router]);

  const { data: workspace, isFetched: listFetched } = useQuery({
    ...workspaceBySlugOptions(workspaceSlug),
    enabled: !!user,
  });

  if (workspace) {
    setCurrentWorkspace(workspaceSlug, workspace.id);
  }

  useEffect(() => {
    if (!workspace || typeof document === "undefined") return;
    const oneYear = 60 * 60 * 24 * 365;
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `last_workspace_slug=${encodeURIComponent(workspaceSlug)}; path=/; max-age=${oneYear}; SameSite=Lax${secure}`;
  }, [workspace, workspaceSlug]);

  const hasBeenSeen = useWorkspaceSeen(workspaceSlug, !!workspace);
  const loadingIndicator = (
    <div className="flex h-svh items-center justify-center">
      <ITeamifyIcon className="size-6 animate-pulse" />
    </div>
  );

  if (isAuthLoading) return loadingIndicator;
  if (!listFetched) return loadingIndicator;
  if (!workspace) {
    if (hasBeenSeen) return null;
    return <NoAccessPage />;
  }

  return (
    <WorkspaceSlugProvider slug={workspaceSlug}>
      {children}
      <OnboardingSetupBanner />
    </WorkspaceSlugProvider>
  );
}
