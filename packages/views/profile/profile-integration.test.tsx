import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@iteamify/core/i18n/react";
import { createAuthStore, registerAuthStore } from "@iteamify/core/auth";
import { useProfileDraftStore } from "@iteamify/core/profile";
import { useOnboardingDraftStore } from "@iteamify/core/onboarding";
import { EMPTY_USER } from "@iteamify/core/api/schemas";
import { registerCurrentUserCache } from "@iteamify/core/profile";
import type { UpdateMeRequest, User } from "@iteamify/core/types";
import onboarding from "../locales/en/onboarding.json";
import settings from "../locales/en/settings.json";
import auth from "../locales/en/auth.json";

const mocks = vi.hoisted(() => ({ updateMe: vi.fn(), getMe: vi.fn(), listWorkspaces: vi.fn() }));
vi.mock("@iteamify/core/api", async (original) => ({ ...(await original<typeof import("@iteamify/core/api")>()), api: { withRequestContext: () => mocks } }));
import { AccountTab } from "../settings/components/account-tab";
import { OnboardingFlow } from "../onboarding/onboarding-flow";
let store: ReturnType<typeof createAuthStore>;
let qc: QueryClient;
function tree(children: React.ReactNode) {
  return <QueryClientProvider client={qc}><I18nProvider locale="en" resources={{ en: { onboarding, settings, auth } }}>{children}</I18nProvider></QueryClientProvider>;
}
beforeEach(() => {
  vi.resetAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  registerCurrentUserCache(qc);
  store = createAuthStore({ api: mocks as never, storage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() } });
  registerAuthStore(store);
  store.getState().setUser({ ...EMPTY_USER, id: "user-1", name: "Alex", onboarded_at: "2026-10-14T00:00:00Z", onboarding_questionnaire: { role: "engineer", use_case: ["ship_code"], source: ["search"] } });
  useOnboardingDraftStore.getState().clearDraft();
  useProfileDraftStore.getState().clearDraft();
  mocks.updateMe.mockImplementation(async (input: UpdateMeRequest): Promise<User> => {
    const user = store.getState().user!;
    return { ...user, ...input, onboarding_questionnaire: { ...user.onboarding_questionnaire, ...input.questionnaire } };
  });
  mocks.listWorkspaces.mockResolvedValue([]);
});

it("shows settings edits in onboarding after saving and remounting", async () => {
  const user = userEvent.setup();
  const view = render(tree(<AccountTab />));
  expect(screen.getByLabelText("Name")).toHaveValue("Alex");
  await user.clear(screen.getByLabelText(onboarding.questions.role.question));
  await user.type(screen.getByLabelText(onboarding.questions.role.question), "Lawyer");
  await user.type(screen.getByLabelText("Additional introduction"), "Prefer concise answers");
  await waitFor(() => expect(store.getState().user?.profile_description).toBe("Prefer concise answers"), { timeout: 2500 });
  expect(store.getState().user?.onboarding_questionnaire.role_other).toBe("Lawyer");
  view.unmount();
  render(tree(<OnboardingFlow requestedStep="profile" onComplete={vi.fn()} />));
  expect(await screen.findByLabelText("Name")).toHaveValue("Alex");
  expect(screen.getByLabelText(onboarding.questions.role.question)).toHaveValue("Lawyer");
  expect(screen.queryByText(onboarding.questions.use_case.question)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Additional introduction")).toHaveValue("Prefer concise answers");
  expect(mocks.getMe).not.toHaveBeenCalled();
  expect(mocks.updateMe.mock.calls.every(([input]) => input.questionnaire?.source === undefined && input.questionnaire?.use_case === undefined)).toBe(true);
});

it("renders the profile while workspace loading is still pending", async () => {
  mocks.listWorkspaces.mockReturnValue(new Promise(() => {}));
  render(tree(<OnboardingFlow requestedStep="profile" onComplete={vi.fn()} />));
  expect(await screen.findByLabelText("Name")).toHaveValue("Alex");
  expect(screen.getByLabelText(onboarding.questions.role.question)).toHaveValue(onboarding.questions.role.engineer);
});
