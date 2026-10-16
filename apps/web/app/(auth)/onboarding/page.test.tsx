import { beforeEach, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useOnboardingDraftStore } from "@iteamify/core/onboarding";
import type { ComponentProps } from "react";
import type { OnboardingFlow } from "@iteamify/views/onboarding";
const mocks = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), search: new URLSearchParams(), user: { id: "user-1", onboarded_at: null as string | null }, loading: false,
  props: null as ComponentProps<typeof OnboardingFlow> | null,
}));
vi.mock("@iteamify/core/auth", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: mocks.user, isLoading: mocks.loading }) }));
vi.mock("@iteamify/views/navigation", () => ({ useNavigation: () => ({ push: mocks.push, replace: mocks.replace, searchParams: mocks.search }) }));
vi.mock("@iteamify/core/workspace/queries", () => ({ workspaceListOptions: () => ({ queryKey: ["workspaces"], queryFn: async () => [{ id: "ws-1", slug: "acme" }] }) }));
vi.mock("@iteamify/views/onboarding", () => ({ CliInstallInstructions: () => null, OnboardingFlow: (props: ComponentProps<typeof OnboardingFlow>) => { mocks.props = props; return <div>Flow</div>; } }));
import Page from "./page";
function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Page /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.onboarded_at = null; mocks.loading = false; mocks.search = new URLSearchParams(); mocks.props = null;
  useOnboardingDraftStore.getState().clearDraft();
});
it("pushes user steps and replaces prerequisite corrections", async () => {
  show(); await waitFor(() => expect(mocks.props).not.toBeNull());
  act(() => mocks.props!.onStepChange!("workspace", "ws-1"));
  expect(mocks.push).toHaveBeenCalledWith("/onboarding?step=workspace&workspace=ws-1");
  act(() => mocks.props!.onStepChange!("assistant", "ws-1", true));
  expect(mocks.replace).toHaveBeenCalledWith("/onboarding?step=assistant&workspace=ws-1");
});
it("does not let the completed-user guard overtake the first-task destination", async () => {
  const view = show(); await waitFor(() => expect(mocks.props).not.toBeNull());
  act(() => mocks.props!.onCompleting!());
  mocks.user.onboarded_at = "now";
  view.rerender(<QueryClientProvider client={new QueryClient()}><Page /></QueryClientProvider>);
  act(() => mocks.props!.onComplete({ id: "ws-1", slug: "acme" } as never, "issue-1"));
  expect(mocks.replace).toHaveBeenCalledWith("/acme/issues/issue-1");
  expect(mocks.replace).not.toHaveBeenCalledWith("/acme/issues");
});
it("allows an onboarded user to resume assistant setup explicitly", async () => {
  mocks.user.onboarded_at = "now"; mocks.search = new URLSearchParams("step=assistant&workspace=ws-1");
  show(); await waitFor(() => expect(mocks.props?.requestedStep).toBe("assistant"));
  expect(mocks.replace).not.toHaveBeenCalled();
});
