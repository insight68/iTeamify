import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@teamify/core/i18n/react";
import { configStore } from "@teamify/core/config";
import enCommon from "@teamify/views/locales/en/common.json";
import enAuth from "@teamify/views/locales/en/auth.json";
import enSettings from "@teamify/views/locales/en/settings.json";
import type { ReactNode } from "react";

const TEST_RESOURCES = {
  en: { common: enCommon, auth: enAuth, settings: enSettings },
};

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </I18nProvider>
  );
}

const { routerPush, searchParamsState, authStateRef } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  searchParamsState: { params: new URLSearchParams() },
  authStateRef: {
    state: {
      user: null as null | {
        id: string;
        email: string;
        onboarded_at?: string | null;
      },
      isLoading: false,
      sendCode: vi.fn(),
      verifyCode: vi.fn(),
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  usePathname: () => "/signup",
  useSearchParams: () => searchParamsState.params,
}));

vi.mock("@teamify/core/auth", async () => {
  const actual =
    await vi.importActual<typeof import("@teamify/core/auth")>(
      "@teamify/core/auth",
    );
  const useAuthStore = Object.assign(
    (selector: (s: typeof authStateRef.state) => unknown) =>
      selector(authStateRef.state),
    { getState: () => authStateRef.state },
  );
  return { ...actual, useAuthStore };
});

vi.mock("@teamify/core/api", () => ({
  api: {
    listWorkspaces: vi.fn().mockResolvedValue([]),
    listMyInvitations: vi.fn().mockResolvedValue([]),
    verifyCode: vi.fn(),
    setToken: vi.fn(),
    getMe: vi.fn().mockRejectedValue(new Error("unauthorized")),
    issueCliToken: vi.fn(),
  },
}));

vi.mock("@/features/auth/auth-cookie", () => ({
  setLoggedInCookie: vi.fn(),
}));

vi.mock("@teamify/views/marketing", () => ({
  LandingNav: () => null,
  LandingFooter: () => null,
}));

import SignupPage from "./page";

describe("SignupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsState.params = new URLSearchParams();
    authStateRef.state.user = null;
    authStateRef.state.isLoading = false;
    configStore.getState().setAuthConfig({ allowSignup: true });
  });

  it("renders the email verification signup flow", () => {
    render(<SignupPage />, { wrapper: createWrapper() });

    expect(screen.getByText("Create your Teamify account")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByLabelText("Phone")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Get verification code" }),
    ).toBeInTheDocument();
  });

  it("shows invite-only guidance when open signup is disabled", async () => {
    configStore.getState().setAuthConfig({ allowSignup: false });
    const user = userEvent.setup();

    render(<SignupPage />, { wrapper: createWrapper() });

    expect(
      screen.getByText("Signup is invite-only right now"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to login" }));

    expect(routerPush).toHaveBeenCalledWith("/login");
  });
});
