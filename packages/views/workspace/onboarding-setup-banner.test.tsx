import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@iteamify/core/i18n/react";
import en from "../locales/en/onboarding.json";
const mocks = vi.hoisted(() => ({ push: vi.fn(), agents: vi.fn(), runtimes: vi.fn(), profile: { role: "engineer" } as Record<string, unknown> }));
vi.mock("@iteamify/core/profile", () => ({ useCurrentUser: () => ({ data: { id: "user-1", onboarded_at: "now", onboarding_questionnaire: mocks.profile } }) }));
vi.mock("@iteamify/core/paths", async (original) => ({ ...(await original<typeof import("@iteamify/core/paths")>()), useCurrentWorkspace: () => ({ id: "ws-1" }) }));
vi.mock("@iteamify/core/api", () => ({ api: { withRequestContext: () => ({ listAgents: mocks.agents, listRuntimes: mocks.runtimes }) } }));
vi.mock("../navigation", () => ({ useNavigation: () => ({ push: mocks.push }) }));
import { OnboardingSetupBanner } from "./onboarding-setup-banner";
function show() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><I18nProvider locale="en" resources={{ en: { onboarding: en } }}><OnboardingSetupBanner /></I18nProvider></QueryClientProvider>); }
beforeEach(() => { vi.resetAllMocks(); mocks.profile = { role: "engineer" }; mocks.agents.mockResolvedValue([]); mocks.runtimes.mockResolvedValue([]); });
it("offers a non-blocking resume entry after setup was skipped", async () => {
  show();
  await userEvent.setup().click(await screen.findByRole("button", { name: en.setup_banner.continue }));
  expect(mocks.push).toHaveBeenCalledWith("/onboarding?step=assistant&workspace=ws-1");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("can be dismissed without server mutations", async () => {
  show();
  await userEvent.setup().click(await screen.findByRole("button", { name: "Close" }));
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
});
