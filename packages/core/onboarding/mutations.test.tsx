// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Agent, Issue } from "../types";
import { ApiError } from "../api/client";

const mocks = vi.hoisted(() => ({ listAgents: vi.fn(), listRuntimes: vi.fn(), createAgent: vi.fn(), listIssues: vi.fn(), createIssue: vi.fn(), context: vi.fn() }));
vi.mock("../api", async () => ({ api: { withRequestContext: mocks.context }, ApiError: (await import("../api/client")).ApiError }));
import { usePrepareOnboardingAssistant, useSubmitOnboardingTask } from "./mutations";
const agent = { id: "agent-1", name: "iteamify Helper", visibility: "workspace", runtime_id: "runtime-1" } as Agent;
const input = { title: "Plan my week", description: "An editable plan", assignee_type: "agent" as const, assignee_id: agent.id };
const issue = { id: "issue-1", workspace_id: "ws-1", creator_id: "user-1", status: "done", ...input } as Issue;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockReturnValue(mocks);
  mocks.listAgents.mockResolvedValue([]);
  mocks.listRuntimes.mockResolvedValue([{ id: "runtime-1", status: "online" }]);
  mocks.createAgent.mockResolvedValue(agent);
  mocks.listIssues.mockResolvedValue({ issues: [], total: 0 });
  mocks.createIssue.mockResolvedValue(issue);
});
describe("onboarding mutations", () => {
  it("reuses a helper instead of creating another", async () => {
    mocks.listAgents.mockResolvedValue([agent]);
    const { result } = renderHook(() => usePrepareOnboardingAssistant("ws-1"), { wrapper });
    await act(async () => { expect(await result.current.mutateAsync({ name: agent.name, runtime_id: agent.runtime_id })).toBe(agent); });
    expect(mocks.createAgent).not.toHaveBeenCalled();
    expect(mocks.context).toHaveBeenCalledWith({ workspaceId: "ws-1" });
  });
  it("does not prepare an offline runtime", async () => {
    mocks.listRuntimes.mockResolvedValue([{ id: "runtime-1", status: "offline" }]);
    const { result } = renderHook(() => usePrepareOnboardingAssistant("ws-1"), { wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ name: agent.name, runtime_id: agent.runtime_id })).rejects.toThrow("runtime_unavailable"); });
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });
  it("reconciles concurrent helper creation", async () => {
    mocks.createAgent.mockRejectedValue(new ApiError("exists", 409, "Conflict"));
    mocks.listAgents.mockResolvedValueOnce([]).mockResolvedValueOnce([agent]);
    const { result } = renderHook(() => usePrepareOnboardingAssistant("ws-1"), { wrapper });
    await act(async () => { expect(await result.current.mutateAsync({ name: agent.name, runtime_id: agent.runtime_id })).toBe(agent); });
    expect(mocks.createAgent).toHaveBeenCalledOnce();
  });
  it("creates exactly one task on the first explicit submission", async () => {
    const { result } = renderHook(() => useSubmitOnboardingTask("ws-1", "user-1"), { wrapper });
    await act(async () => { await result.current.mutateAsync({ input, recover: false }); });
    expect(mocks.createIssue).toHaveBeenCalledOnce();
    expect(mocks.listIssues).not.toHaveBeenCalled();
  });
  it("recovers a completed task after a lost receipt instead of creating it again", async () => {
    mocks.listIssues.mockResolvedValue({ issues: [issue], total: 1 });
    const { result } = renderHook(() => useSubmitOnboardingTask("ws-1", "user-1"), { wrapper });
    await act(async () => { expect(await result.current.mutateAsync({ input, recover: true })).toBe(issue); });
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });
  it("never recovers another owner's task or different task text", async () => {
    mocks.listIssues.mockResolvedValue({ issues: [{ ...issue, creator_id: "other" }, { ...issue, description: "different" }], total: 2 });
    const { result } = renderHook(() => useSubmitOnboardingTask("ws-1", "user-1"), { wrapper });
    await act(async () => { await result.current.mutateAsync({ input, recover: true }); });
    expect(mocks.createIssue).toHaveBeenCalledOnce();
  });
});
