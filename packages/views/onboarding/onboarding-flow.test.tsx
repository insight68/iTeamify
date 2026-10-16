import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@iteamify/core/i18n/react";
import { useOnboardingDraftStore } from "@iteamify/core/onboarding";
import type { Workspace, User, AgentRuntime } from "@iteamify/core/types";
import { useProfileDraftStore } from "@iteamify/core/profile";
import { registerCurrentUserCache, publishCurrentUser } from "@iteamify/core/profile";
import settings from "../locales/en/settings.json";
import en from "../locales/en/onboarding.json";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1", onboarding_questionnaire: {}, onboarded_at: null } as unknown as User,
  workspaces: vi.fn(), agents: vi.fn(), runtimes: vi.fn(), createAgent: vi.fn(), createIssue: vi.fn(), issues: vi.fn(), getIssue: vi.fn(), save: vi.fn(), complete: vi.fn(),
}));
vi.mock("@iteamify/core/auth", () => ({ useAuthStore: Object.assign((selector: (state: { user: User }) => unknown) => selector({ user: mocks.user }), { getState: () => ({ user: mocks.user, sessionGeneration: 0, setUser: (user: User) => { mocks.user = publishCurrentUser(user); } }) }) }));
vi.mock("@iteamify/core/api", async () => ({
  ApiError: (await vi.importActual<typeof import("@iteamify/core/api")>("@iteamify/core/api")).ApiError,
  api: { withRequestContext: () => ({ listWorkspaces: mocks.workspaces, listAgents: mocks.agents, listRuntimes: mocks.runtimes, createAgent: mocks.createAgent, createIssue: mocks.createIssue, listIssues: mocks.issues, getIssue: mocks.getIssue, updateMe: mocks.save }) },
}));
vi.mock("@iteamify/core/onboarding", async (original) => ({ ...(await original<typeof import("@iteamify/core/onboarding")>()), saveQuestionnaire: mocks.save, completeOnboarding: mocks.complete }));
vi.mock("./steps/step-workspace", () => ({ StepWorkspace: ({ onCreated, onBack }: { onCreated: (ws: Workspace) => void; onBack: () => void }) => <><h1>Workspace setup</h1><button onClick={() => onCreated(workspace)}>Use workspace</button><button onClick={onBack}>Back</button></> }));
vi.mock("./steps/step-runtime-connect", () => ({ StepRuntimeConnect: ({ onNext, onBack }: { onNext: (rt: AgentRuntime | null) => void; onBack: () => void }) => <><h1>Assistant setup</h1><button onClick={() => onNext(runtime)}>Connect assistant</button><button onClick={() => onNext(null)}>Enter workspace</button><button onClick={onBack}>Back</button></> }));
import { OnboardingFlow } from "./onboarding-flow";
const workspace = { id: "ws-1", slug: "acme", name: "Acme" } as Workspace;
const runtime = { id: "rt-1", status: "online" } as AgentRuntime;
const agent = { id: "agent-1", name: "iteamify Helper", runtime_id: runtime.id, visibility: "workspace" };
function show(props: Partial<React.ComponentProps<typeof OnboardingFlow>> = {}) {
  const onComplete = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  registerCurrentUserCache(qc);
  const view = (extra = props) => <QueryClientProvider client={qc}><I18nProvider locale="en" resources={{ en: { onboarding: en, settings } }}><OnboardingFlow onComplete={onComplete} {...extra} /></I18nProvider></QueryClientProvider>;
  const rendered = render(view());
  return { ...rendered, onComplete, user: userEvent.setup(), reroute: (extra: typeof props) => rendered.rerender(view(extra)) };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user = { id: "user-1", name: "Tester", profile_description: "", onboarding_questionnaire: {}, onboarded_at: null } as unknown as User;
  useOnboardingDraftStore.getState().clearDraft();
  useProfileDraftStore.getState().clearDraft();
  mocks.workspaces.mockResolvedValue([workspace]);
  mocks.agents.mockResolvedValue([agent]);
  mocks.runtimes.mockResolvedValue([runtime]);
  mocks.complete.mockResolvedValue(undefined);
  mocks.save.mockImplementation(async (input) => ({ ...mocks.user, ...input, onboarding_questionnaire: { ...mocks.user.onboarding_questionnaire, ...input.questionnaire } }));
  mocks.createAgent.mockResolvedValue(agent);
  mocks.createIssue.mockResolvedValue({ id: "issue-1", workspace_id: workspace.id });
  mocks.issues.mockResolvedValue({ issues: [], total: 0 });
});
describe("four-step onboarding", () => {
  it("starts at the optional profile directly", async () => {
    show();
    expect(await screen.findByRole("heading", { name: "Tell us a bit about you." })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "4");
  });
  it("does not restore another account's answers or task", async () => {
    useOnboardingDraftStore.getState().setDraft({ ownerId: "other-user", workspaceId: workspace.id,
      step: "task", taskTitle: "Private task" });
    useProfileDraftStore.getState().setDraft({ ownerId: "other-user", edits: { role: "engineer" } });
    show();
    await screen.findByRole("heading", { name: "Tell us a bit about you." });
    expect(screen.getByRole("radio", { name: /engineer/i })).toHaveAttribute("aria-checked", "false");
    expect(useOnboardingDraftStore.getState().draft.taskTitle).toBe("");
    expect(useOnboardingDraftStore.getState().draft.ownerId).toBe(mocks.user.id);
  });
  it("keeps input and the current step when profile saving fails, then retries", async () => {
    mocks.save.mockRejectedValueOnce(new Error("offline"));
    const { user } = show();
    await user.click(await screen.findByRole("radio", { name: /engineer/i }));
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("offline");
    expect(screen.getByRole("radio", { name: /engineer/i })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(await screen.findByRole("heading", { name: "Workspace setup" })).toBeInTheDocument();
    expect(mocks.save).toHaveBeenCalledTimes(2);
  });
  it("recovers an unfinished task after remount and submits it directly", async () => {
    useOnboardingDraftStore.getState().setDraft({ ownerId: mocks.user.id, workspaceId: workspace.id, agentId: agent.id, runtimeId: runtime.id, step: "task", taskTitle: "My task", taskDescription: "My request" });
    const first = show();
    await screen.findByRole("heading", { name: en.step_task.title });
    first.unmount();
    const { user, onComplete } = show();
    expect(await screen.findByLabelText("Task title")).toHaveValue("My task");
    await user.click(screen.getByRole("button", { name: en.step_task.submit }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(workspace, "issue-1"));
    expect(mocks.createIssue).toHaveBeenCalledOnce();
    expect(mocks.complete).toHaveBeenCalledWith("full", workspace.id);
    await waitFor(() => expect(useOnboardingDraftStore.getState().draft.ownerId).toBe(""));
    expect(screen.queryByRole("heading", { name: "Assistant setup" })).not.toBeInTheDocument();
  });
  it("reuses a submitted receipt after completion failed", async () => {
    useOnboardingDraftStore.getState().setDraft({ ownerId: mocks.user.id, workspaceId: workspace.id, agentId: agent.id, step: "task", issueId: "issue-1", taskTitle: "Saved" });
    mocks.getIssue.mockResolvedValue({ id: "issue-1", workspace_id: workspace.id, creator_id: mocks.user.id });
    const { user, onComplete } = show();
    await user.click(await screen.findByRole("button", { name: en.step_task.open_task }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(workspace, "issue-1"));
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });
  it("preserves the submitted text across a lost receipt and remount", async () => {
    useOnboardingDraftStore.getState().setDraft({ ownerId: mocks.user.id, workspaceId: workspace.id,
      agentId: agent.id, runtimeId: runtime.id, step: "task", taskTitle: "My task",
      taskDescription: "My request" });
    mocks.user.onboarding_questionnaire = { role: "engineer" };
    mocks.createIssue.mockRejectedValueOnce(new Error("connection lost"));
    const first = show();
    await first.user.click(await screen.findByRole("button", { name: en.step_task.submit }));
    await screen.findByRole("alert");
    expect(mocks.createIssue).toHaveBeenCalledOnce();
    const submittedInput = mocks.createIssue.mock.calls[0]![0];
    expect(screen.getByLabelText("Task title")).toBeDisabled();
    first.unmount();
    mocks.user = { ...mocks.user, onboarding_questionnaire: { role: "designer" } };
    mocks.issues.mockResolvedValue({ issues: [{ id: "issue-1", workspace_id: workspace.id,
      creator_id: mocks.user.id, ...submittedInput }], total: 1 });
    const second = show();
    await second.user.click(await screen.findByRole("button", { name: en.step_task.submit }));
    await waitFor(() => expect(second.onComplete).toHaveBeenCalledWith(workspace, "issue-1"));
    expect(mocks.createIssue).toHaveBeenCalledOnce();
    expect(mocks.issues).toHaveBeenCalledOnce();
  });
  it("corrects a task deep link whose workspace is not accessible", async () => {
    const onStepChange = vi.fn();
    show({ requestedStep: "task", requestedWorkspaceId: "other-workspace", onStepChange });
    await screen.findByRole("heading", { name: "Workspace setup" });
    expect(onStepChange).toHaveBeenCalledWith("workspace", undefined, true);
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });
  it("restores previous answers on browser back without a route transition race", async () => {
    const onStepChange = vi.fn();
    const view = show({ requestedStep: "profile", onStepChange });
    await view.user.click(await screen.findByRole("radio", { name: /designer/i }));
    await view.user.click(screen.getByRole("button", { name: /^continue$/i }));
    await screen.findByRole("heading", { name: "Workspace setup" });
    await act(async () => view.reroute({ requestedStep: "workspace", onStepChange }));
    await act(async () => view.reroute({ requestedStep: "profile", onStepChange }));
    expect(screen.getByRole("radio", { name: /designer/i })).toHaveAttribute("aria-checked", "true");
  });
});
