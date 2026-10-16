import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@iteamify/core/i18n/react";
import { createAuthStore, registerAuthStore, useAuthStore } from "@iteamify/core/auth";
import { configStore } from "@iteamify/core/config";
import type { ApiClient } from "@iteamify/core/api/client";
import type { User } from "@iteamify/core/types";
import enAuth from "../locales/en/auth.json";

const api = vi.hoisted(() => ({ getPasswordStatus: vi.fn(), createAuthChallenge: vi.fn(), verifyAuthChallenge: vi.fn(), changePassword: vi.fn(), resetPassword: vi.fn(), advanceAuthSession: vi.fn(), setToken: vi.fn() }));
vi.mock("@iteamify/core/api", async () => ({
  ...(await vi.importActual<typeof import("@iteamify/core/api")>("@iteamify/core/api")), api,
}));
import { PasswordSettings } from "./password-settings";
import { PasswordSetupPrompt } from "./password-setup-prompt";

function show(component = <PasswordSettings />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><I18nProvider locale="en" resources={{ en: { auth: enAuth } }}>{component}</I18nProvider></QueryClientProvider>);
  return userEvent.setup();
}

beforeEach(() => {
  vi.resetAllMocks();
  configStore.getState().setAuthConfig({ allowSignup: true, passwordAuthEnabled: true });
  const store = createAuthStore({ api: api as unknown as ApiClient, cookieAuth: true, storage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() } });
  store.setState({ user: { id: "u", email: "user@example.test", name: "User" } as User, status: "authenticated", isLoading: false });
  registerAuthStore(store);
  api.getPasswordStatus.mockResolvedValue({ has_password: false });
  api.createAuthChallenge.mockResolvedValue({ challenge_id: "00000000-0000-4000-8000-000000000001", retry_after_seconds: 60, expires_in_seconds: 600 });
  api.verifyAuthChallenge.mockResolvedValue({ action: "set_password", proof: "a".repeat(64) });
  api.changePassword.mockResolvedValue({ token: "new-token", user: { id: "u", email: "user@example.test" } });
});

describe("password account settings", () => {
  it("requires email verification and explicit submission to set the first password", async () => {
    const user = show();
    await user.click(await screen.findByRole("button", { name: enAuth.password.set }));
    await user.click(screen.getByRole("button", { name: enAuth.password.send }));
    await user.type(await screen.findByLabelText(enAuth.password.code_label), "654321");
    await user.click(screen.getByRole("button", { name: enAuth.password.verify_code }));
    await user.type(await screen.findByLabelText(enAuth.password.new_label), "River1234");
    const submit = screen.getByRole("button", { name: enAuth.password.save });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(enAuth.password.new_label), "5");
    expect(submit).toBeEnabled();
    expect(api.changePassword).not.toHaveBeenCalled();
    await user.click(submit);
    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith(expect.objectContaining({ purpose: "set_password", proof: "a".repeat(64), password: "River12345" })));
    expect(await screen.findByRole("button", { name: enAuth.password.change })).toBeInTheDocument();
  });

  it("requires the current password for a change", async () => {
    api.getPasswordStatus.mockResolvedValue({ has_password: true });
    const user = show();
    await user.click(await screen.findByRole("button", { name: enAuth.password.change }));
    await user.type(screen.getByLabelText(enAuth.password.new_label), "River12345");
    expect(screen.getByRole("button", { name: enAuth.password.save })).toBeDisabled();
    await user.type(screen.getByLabelText(enAuth.password.current_label), "old password phrase");
    await user.click(screen.getByRole("button", { name: enAuth.password.save }));
    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith(expect.objectContaining({ current_password: "old password phrase", password: "River12345" })));
    expect(api.createAuthChallenge).not.toHaveBeenCalled();
  });

  it("does not interpret a failed status query as no password", async () => {
    api.getPasswordStatus.mockRejectedValue(new Error("offline"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent(enAuth.password.status_failed);
    expect(screen.queryByRole("button", { name: enAuth.password.set })).not.toBeInTheDocument();
  });

  it("can recover a forgotten current password and ends the current session", async () => {
    api.getPasswordStatus.mockResolvedValue({ has_password: true });
    api.verifyAuthChallenge.mockResolvedValue({ action: "reset", proof: "b".repeat(64) });
    api.resetPassword.mockResolvedValue(undefined);
    const user = show();
    await user.click(await screen.findByRole("button", { name: enAuth.password.change }));
    await user.click(screen.getByRole("button", { name: enAuth.password.forgot }));
    await user.click(screen.getByRole("button", { name: enAuth.password.send }));
    await user.type(await screen.findByLabelText(enAuth.password.code_label), "654321");
    await user.click(screen.getByRole("button", { name: enAuth.password.verify_code }));
    await user.type(await screen.findByLabelText(enAuth.password.new_label), "a long new password phrase");
    await user.click(screen.getByRole("button", { name: enAuth.password.save }));
    await waitFor(() => expect(useAuthStore.getState().status).toBe("unauthenticated"));
    expect(api.createAuthChallenge).toHaveBeenCalledWith("user@example.test", "reset", "en");
    expect(api.resetPassword).toHaveBeenCalledOnce();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("lets an existing user dismiss the prompt without changing their account", async () => {
    const user = show(<PasswordSetupPrompt />);
    await user.click(await screen.findByRole("button", { name: enAuth.password.skip }));
    expect(screen.queryByText(enAuth.password.prompt_description)).not.toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
  });
});
