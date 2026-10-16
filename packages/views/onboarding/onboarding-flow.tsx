"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@iteamify/ui/components/ui/button";
import { DragStrip } from "@iteamify/views/platform";
import { useAuthStore } from "@iteamify/core/auth";
import {
  completeOnboarding, parseOnboardingStep, resolveOnboardingStep,
  useOnboardingDraftStore, EMPTY_ONBOARDING_DRAFT,
  usePrepareOnboardingAssistant, useSubmitOnboardingTask,
  type OnboardingStep,
} from "@iteamify/core/onboarding";
import { workspaceListOptions, agentListOptions } from "@iteamify/core/workspace/queries";
import { runtimeListOptions } from "@iteamify/core/runtimes/queries";
import { issueDetailOptions } from "@iteamify/core/issues/queries";
import type { AgentRuntime, Workspace } from "@iteamify/core/types";
import { ApiError } from "@iteamify/core/api";
import { useProfileForm, profileForAdvance, readQuestionnaire } from "@iteamify/core/profile";
import { StepAboutYou } from "./steps/step-about-you";
import { StepWorkspace } from "./steps/step-workspace";
import { StepRuntimeConnect } from "./steps/step-runtime-connect";
import { StepPlatformFork } from "./steps/step-platform-fork";
import { StepFirstTask } from "./steps/step-first-task";
import { HELPER_DESCRIPTION, HELPER_INSTRUCTIONS, pickContentLang } from "./templates";
import { useT } from "../i18n";

export function OnboardingFlow({
  onComplete, onCompleting, requestedStep, requestedWorkspaceId, onStepChange,
  runtimeInstructions, onRuntimeRefresh, runtimesPending,
}: {
  onComplete: (workspace?: Workspace, issueId?: string) => void;
  onCompleting?: () => void;
  requestedStep?: string | null;
  requestedWorkspaceId?: string | null;
  onStepChange?: (step: OnboardingStep, workspaceId?: string, replace?: boolean) => void;
  runtimeInstructions?: React.ReactNode;
  onRuntimeRefresh?: () => void | Promise<void>;
  runtimesPending?: boolean;
}) {
  const { t, i18n } = useT("onboarding");
  const sessionUser = useAuthStore((state) => state.user);
  const profile = useProfileForm();
  const user = profile.user ?? sessionUser;
  if (!user) throw new Error("OnboardingFlow requires an authenticated user");
  const draft = useOnboardingDraftStore((state) => state.draft);
  const patch = useOnboardingDraftStore((state) => state.setDraft);
  const finishing = useRef(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [transition, setTransition] = useState<{ step: OnboardingStep; workspaceId: string; from: string } | null>(null);
  const busy = useRef(false);
  const ownsDraft = draft.ownerId === user.id;
  const routeKey = `${requestedStep ?? ""}:${requestedWorkspaceId ?? ""}`;
  const requested = transition?.step ?? parseOnboardingStep(requestedStep) ?? (ownsDraft ? draft.step : "profile");
  const workspaceId = transition?.workspaceId ?? requestedWorkspaceId ?? (ownsDraft ? draft.workspaceId : "");
  const workspaces = useQuery(workspaceListOptions());
  const workspace = workspaces.data?.find((entry) => entry.id === workspaceId) ?? null;
  const needsAssistant = !!workspace && (requested === "task" || requested === "assistant");
  const agents = useQuery({ ...agentListOptions(workspace?.id ?? ""), enabled: needsAssistant });
  const runtimes = useQuery({ ...runtimeListOptions(workspace?.id ?? ""), enabled: needsAssistant });
  const receipt = useQuery({
    ...issueDetailOptions(workspace?.id ?? "", ownsDraft ? draft.issueId : ""),
    enabled: !!workspace && ownsDraft && !!draft.issueId,
    retry: false,
  });
  const agent = agents.data?.find((entry) => entry.id === draft.agentId && !entry.archived_at) ?? null;
  const assistantReady = !!agent && runtimes.data?.some((runtime) => runtime.id === agent.runtime_id && runtime.status === "online") === true;
  const submitted = !!receipt.data && receipt.data.workspace_id === workspace?.id && receipt.data.creator_id === user.id;
  const step = pending ? requested : resolveOnboardingStep(requested, !!workspace, assistantReady, submitted);
  const preparing = usePrepareOnboardingAssistant(workspace?.id ?? "");
  const submitting = useSubmitOnboardingTask(workspace?.id ?? "", user.id);
  const completion = useMutation({ mutationFn: (path: "full" | "runtime_skipped") => completeOnboarding(path, workspace?.id) });
  const loading = finishing.current || !ownsDraft || (requested !== "profile" && workspaces.isPending) ||
    (requested === "task" && !!workspace && (agents.isPending || runtimes.isPending || (!!draft.issueId && receipt.isPending)));
  const loadError = (requested !== "profile" && workspaces.error) || (requested === "task" && (agents.error || runtimes.error));
  const current = () => useAuthStore.getState().user?.id === user.id && useOnboardingDraftStore.getState().draft.ownerId === user.id;

  useEffect(() => {
    if (transition && routeKey !== transition.from) setTransition(null);
  }, [transition, routeKey]);

  useEffect(() => {
    if (ownsDraft || finishing.current) return;
    patch({ ...EMPTY_ONBOARDING_DRAFT, ownerId: user.id });
  }, [ownsDraft, patch, user.id, user.onboarding_questionnaire]);

  useEffect(() => {
    if (loading || loadError || finishing.current || pending || transition || workspaces.isPending) return;
    if (draft.step !== step || draft.workspaceId !== (workspace?.id ?? "")) {
      patch({ step, workspaceId: workspace?.id ?? "" });
    }
    if (onStepChange && (requestedStep !== step || (requestedWorkspaceId ?? "") !== (workspace?.id ?? ""))) {
      onStepChange(step, workspace?.id, true);
    }
  }, [loading, loadError, pending, transition, workspaces.isPending, step, workspace?.id, draft.step, draft.workspaceId, requestedStep, requestedWorkspaceId, patch, onStepChange]);

  const move = (next: OnboardingStep, wsId = workspace?.id) => {
    setError("");
    if (onStepChange && `${next}:${wsId ?? ""}` !== routeKey) {
      setTransition({ step: next, workspaceId: wsId ?? "", from: routeKey });
    }
    patch({ step: next, ...(wsId ? { workspaceId: wsId } : {}) });
    onStepChange?.(next, wsId);
  };
  const run = async (action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try { await action(); }
    catch (cause) {
      if (current()) setError(cause instanceof Error && cause.message === "runtime_unavailable" ? t(($) => $.flow.runtime_unavailable)
        : cause instanceof Error && cause.message ? cause.message : t(($) => $.flow.failed));
    } finally { busy.current = false; setPending(false); }
  };
  const finish = async (issueId?: string) => {
    if (!workspace || !current()) return;
    onCompleting?.();
    if (!user.onboarded_at) await completion.mutateAsync(issueId || assistantReady ? "full" : "runtime_skipped");
    if (!current()) return;
    finishing.current = true;
    onComplete(workspace, issueId);
    useOnboardingDraftStore.getState().clearDraft();
  };
  const saveProfile = (later = false) => run(async () => {
    if (!profile.value || !profile.saved) return;
    await profile.save(profileForAdvance(profile.value, profile.saved, later));
    if (!current()) return;
    if (user.onboarded_at && workspace) await finish();
    else move("workspace");
  });
  const prepareAssistant = (runtime: AgentRuntime | null) => run(async () => {
    if (!runtime) { await finish(); return; }
    if (runtime.status !== "online") throw new Error("runtime_unavailable");
    const lang = pickContentLang(i18n.language);
    const prepared = await preparing.mutateAsync({
      name: "iteamify Helper", description: HELPER_DESCRIPTION[lang], instructions: HELPER_INSTRUCTIONS[lang],
      runtime_id: runtime.id, visibility: "workspace", max_concurrent_tasks: 6, template: "iteamify_helper",
    });
    if (!current()) return;
    patch({ agentId: prepared.id, runtimeId: prepared.runtime_id });
    move("task");
  });
  const assignTask = () => run(async () => {
    if (submitted) { await finish(receipt.data!.id); return; }
    if (!agent || !assistantReady) { move("assistant"); return; }
    const input = useOnboardingDraftStore.getState().draft;
    const answers = readQuestionnaire(user.onboarding_questionnaire ?? {});
    const role = answers.role === "other" ? answers.role_other : answers.role ? t(($) => $.questions.role[answers.role!]) : "";
    const useCases = answers.use_case.map((value) => value === "other" ? answers.use_case_other : t(($) => $.questions.use_case[value])).filter(Boolean).join(" / ");
    const context = [role && `${t(($) => $.welcome_after_onboarding.user_context_role_label)}: ${role}`,
      useCases && `${t(($) => $.welcome_after_onboarding.user_context_use_case_label)}: ${useCases}`].filter(Boolean).join("\n");
    const submission = input.taskSubmission ?? { title: input.taskTitle.trim(),
      description: input.taskDescription.trim() + (context ? `\n\n${context}` : ""), agentId: agent.id };
    patch({ taskAttempted: true, taskSubmission: submission });
    let issue;
    try {
      issue = await submitting.mutateAsync({ recover: input.taskAttempted,
        input: { title: submission.title, description: submission.description,
          status: "todo", priority: "medium", assignee_type: "agent", assignee_id: submission.agentId },
      });
    } catch (cause) {
      if (current() && cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        patch({ taskAttempted: false, taskSubmission: null });
      }
      throw cause;
    }
    if (!current()) return;
    patch({ issueId: issue.id });
    await finish(issue.id);
  });

  if (loading || loadError) return (
    <div className="flex h-full flex-col bg-background"><DragStrip /><div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
      {loadError ? <><p role="alert">{t(($) => $.flow.load_failed)}</p><Button onClick={() => { void workspaces.refetch(); void agents.refetch(); void runtimes.refetch(); }}>{t(($) => $.flow.retry)}</Button></>
        : <><Loader2 className="size-5 animate-spin" /><p className="text-sm text-muted-foreground">{finishing.current ? t(($) => $.flow.opening) : t(($) => $.flow.loading)}</p></>}
    </div></div>
  );
  if (step === "profile" && profile.value) return <StepAboutYou
    value={profile.value} onChange={profile.change}
    onAdvance={() => saveProfile()} onSkip={() => saveProfile(true)} pending={pending} error={error}
    onAvatarUploaded={async (avatar_url) => { profile.change({ avatar_url }); await profile.update.mutateAsync({ avatar_url }); }}
  />;
  if (step === "workspace") return <StepWorkspace
    existing={workspace ?? workspaces.data?.[0]} onCreated={(created) => {
      if (draft.workspaceId !== created.id) patch({ runtimeId: "", agentId: "", issueId: "", taskAttempted: false, taskSubmission: null });
      patch({ workspaceId: created.id });
      move("assistant", created.id);
    }} onBack={() => move("profile")} draft={draft}
    onDraftChange={(value) => patch(value)}
    workspaces={workspaces.data} onWorkspaceSelected={(selected) => {
      if (draft.workspaceId !== selected.id) patch({ runtimeId: "", agentId: "", issueId: "", taskAttempted: false, taskSubmission: null });
      move("workspace", selected.id);
    }}
  />;
  if (step === "assistant" && workspace) return <div className="flex h-full min-h-0 flex-col">
    {error && <p role="alert" className="shrink-0 bg-destructive/10 px-6 py-3 text-sm text-destructive">{error}</p>}
    <div className="min-h-0 flex-1">{runtimeInstructions
      ? <StepPlatformFork wsId={workspace.id} onNext={prepareAssistant} onBack={() => move("workspace")} cliInstructions={runtimeInstructions} pending={pending} initialRuntimeId={draft.runtimeId} onRuntimeSelected={(runtimeId) => patch({ runtimeId })} />
      : <StepRuntimeConnect wsId={workspace.id} onNext={prepareAssistant} onBack={() => move("workspace")} onRefresh={onRuntimeRefresh} runtimesPending={runtimesPending} initialRuntimeId={draft.runtimeId} onRuntimeSelected={(runtimeId) => patch({ runtimeId })} />}
    </div></div>;
  if (step === "task" && workspace) return <StepFirstTask
    agentName={agent?.name ?? "iteamify Helper"} answers={readQuestionnaire(user.onboarding_questionnaire ?? {})}
    title={draft.taskTitle} description={draft.taskDescription} pending={pending} submitted={submitted}
    locked={draft.taskAttempted} error={error} onChange={(value) => patch({ ...value, taskAttempted: false, taskSubmission: null })}
    onSubmit={assignTask} onSkip={() => run(() => finish(submitted ? receipt.data!.id : undefined))} onBack={() => move("assistant")}
  />;
  return null;
}

export type { OnboardingStep };
