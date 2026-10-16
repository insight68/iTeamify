"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@iteamify/core/auth";
import { paths, resolvePostAuthDestination } from "@iteamify/core/paths";
import { parseOnboardingStep, useOnboardingDraftStore, type OnboardingStep } from "@iteamify/core/onboarding";
import { workspaceListOptions } from "@iteamify/core/workspace/queries";
import { CliInstallInstructions, OnboardingFlow } from "@iteamify/views/onboarding";
import { useNavigation } from "@iteamify/views/navigation";

export default function OnboardingPage() {
  const { push, replace, searchParams } = useNavigation();
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const draft = useOnboardingDraftStore((state) => state.draft);
  const requestedStep = searchParams.get("step");
  const requestedWorkspaceId = searchParams.get("workspace");
  const explicitStep = parseOnboardingStep(requestedStep);
  const workspaces = useQuery({ ...workspaceListOptions(), enabled: !!user });
  const completing = useRef(false);
  const hasOnboarded = user?.onboarded_at != null;

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      replace(`${paths.login()}?next=${encodeURIComponent(paths.onboarding(explicitStep ?? undefined, requestedWorkspaceId ?? undefined))}`);
      return;
    }
    if (!workspaces.isSuccess || completing.current || explicitStep || !hasOnboarded) return;
    const workspace = workspaces.data.find((entry) => entry.id === draft.workspaceId);
    // A committed task survives a later completion/refresh failure.
    if (draft.ownerId === user.id && draft.issueId && workspace) {
      replace(paths.workspace(workspace.slug).issueDetail(draft.issueId));
    } else {
      replace(resolvePostAuthDestination(workspaces.data, true));
    }
  }, [isLoading, user, workspaces.isSuccess, workspaces.data, hasOnboarded, explicitStep, requestedWorkspaceId, draft.ownerId, draft.workspaceId, draft.issueId, replace]);

  const onStepChange = useCallback((step: OnboardingStep, workspaceId?: string, correct = false) => {
    (correct ? replace : push)(paths.onboarding(step, workspaceId));
  }, [push, replace]);
  if (isLoading || !user || (hasOnboarded && !explicitStep && !completing.current)) return null;
  return <div className="h-full overflow-y-auto bg-background">
    <OnboardingFlow
      requestedStep={requestedStep} requestedWorkspaceId={requestedWorkspaceId} onStepChange={onStepChange}
      onCompleting={() => { completing.current = true; }}
      onComplete={(workspace, issueId) => {
        if (workspace) replace(issueId ? paths.workspace(workspace.slug).issueDetail(issueId) : paths.workspace(workspace.slug).issues());
        else replace(paths.newWorkspace());
      }}
      runtimeInstructions={<CliInstallInstructions />}
    />
  </div>;
}
