import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@iteamify/core/i18n/react";
import enAuth from "@iteamify/views/locales/en/auth.json";
import enCommon from "@iteamify/views/locales/en/common.json";
import enSettings from "@iteamify/views/locales/en/settings.json";
import type { ComponentProps, ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  user: null as null | { id: string; onboarded_at: string },
  getContext: vi.fn(),
  login: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => "/login",
  useSearchParams: () => mocks.params,
}));
vi.mock("@iteamify/core/auth", async () => ({
  ...(await vi.importActual<typeof import("@iteamify/core/auth")>("@iteamify/core/auth")),
  useAuthStore: Object.assign(
    (selector: (state: { user: typeof mocks.user; isLoading: boolean }) => unknown) => selector({ user: mocks.user, isLoading: false }),
    { getState: () => ({ user: mocks.user, isLoading: false }) },
  ),
}));
vi.mock("@iteamify/core/config", () => ({
  useConfigStore: (selector: (state: object) => unknown) => selector({ googleClientId: "", passwordAuthEnabled: true, allowSignup: true }),
}));
vi.mock("@iteamify/core/api", () => ({ api: { getInvitationLoginContext: mocks.getContext } }));
vi.mock("@iteamify/views/auth", () => ({
  validateCliCallback: () => false,
  LoginPage: (props: ComponentProps<typeof import("@iteamify/views/auth").LoginPage>) => {
    mocks.login(props);
    return <button onClick={() => void props.onSuccess()}>Finish sign in</button>;
  },
}));
vi.mock("@/features/auth/auth-cookie", () => ({ setLoggedInCookie: vi.fn() }));

import Page from "./page";

const invitationId = "00000000-0000-4000-8000-000000000001";
const invitationPath = `/invite/${invitationId}`;
function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<Page />, { wrapper: ({ children }: { children: ReactNode }) => (
    <I18nProvider locale="en" resources={{ en: { auth: enAuth, common: enCommon, settings: enSettings } }}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </I18nProvider>
  ) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
  mocks.params = new URLSearchParams({ next: invitationPath });
  mocks.getContext.mockResolvedValue({ email: "invitee@example.test" });
});

describe("invitation login platform wiring", () => {
  it("waits for the invited email and mounts verification-code login", async () => {
    let resolve!: (context: { email: string }) => void;
    mocks.getContext.mockReturnValue(new Promise<{ email: string }>((done) => { resolve = done; }));
    show();
    await waitFor(() => expect(mocks.getContext).toHaveBeenCalledWith(invitationId));
    expect(mocks.login).not.toHaveBeenCalled();
    await act(async () => resolve({ email: "invitee@example.test" }));
    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith(expect.objectContaining({
      initialMode: "code", initialEmail: "invitee@example.test", passwordEnabled: true,
    })));
    await userEvent.setup().click(screen.getByRole("button", { name: "Finish sign in" }));
    expect(mocks.push).toHaveBeenCalledWith(invitationPath);
  });

  it("leaves the email editable when the invitation lookup fails", async () => {
    mocks.getContext.mockRejectedValue(new Error("invitation not found"));
    show();
    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith(expect.objectContaining({
      initialMode: "code", initialEmail: "",
    })));
  });

  it("keeps ordinary login defaults without looking up an invitation", () => {
    mocks.params = new URLSearchParams();
    show();
    expect(mocks.getContext).not.toHaveBeenCalled();
    expect(mocks.login).toHaveBeenCalledWith(expect.objectContaining({ initialMode: undefined, initialEmail: "" }));
  });

  it("does not resolve off-origin next destinations", () => {
    mocks.params = new URLSearchParams({ next: `https://other.example${invitationPath}` });
    show();
    expect(mocks.getContext).not.toHaveBeenCalled();
  });

  it("returns an existing session to the invite without a public lookup", async () => {
    mocks.user = { id: "user", onboarded_at: "2026-10-12" };
    show();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(invitationPath));
    expect(mocks.getContext).not.toHaveBeenCalled();
  });
});
