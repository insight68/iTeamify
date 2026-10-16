import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@iteamify/core/i18n/react";
import enAuth from "../locales/en/auth.json";
import { ApiError } from "@iteamify/core/api";

const mocks = vi.hoisted(() => ({
  login: vi.fn(), signup: vi.fn(), verify: vi.fn(), workspaces: vi.fn(), challenge: vi.fn(), reset: vi.fn(), getMe: vi.fn(), cli: vi.fn(),
}));
vi.mock("@iteamify/core/auth", () => ({ useAuthStore: Object.assign(() => null, { getState: () => ({ loginWithPassword: mocks.login, signupWithPassword: mocks.signup, verifyAuthChallenge: mocks.verify }) }) }));
vi.mock("@iteamify/core/api", async () => ({
  ApiError: (await vi.importActual<typeof import("@iteamify/core/api")>("@iteamify/core/api")).ApiError,
  api: { listWorkspaces: mocks.workspaces, createAuthChallenge: mocks.challenge, resetPassword: mocks.reset, getMe: mocks.getMe, issueCliToken: mocks.cli, setToken: vi.fn() },
}));
import { LoginPage } from "./login-page";

function show(props: Partial<React.ComponentProps<typeof LoginPage>> = {}) {
  const onSuccess = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><I18nProvider locale="en" resources={{ en: { auth: enAuth } }}><LoginPage onSuccess={onSuccess} {...props} /></I18nProvider></QueryClientProvider>);
  return { onSuccess, user: userEvent.setup() };
}
async function enterEmail(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^email$/i), "user@example.test");
}
async function verifyEmail(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^continue$/i }));
  await user.type(await screen.findByRole("textbox", { hidden: true }), "654321");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspaces.mockResolvedValue([]);
  mocks.challenge.mockResolvedValue({ challenge_id: "00000000-0000-4000-8000-000000000001", retry_after_seconds: 60, expires_in_seconds: 600 });
  mocks.getMe.mockRejectedValue(new Error("unauthorized"));
});

describe("password login flow", () => {
  it("prefills an invited email and starts in verification-code mode", async () => {
    const { user } = show({ initialEmail: "invitee@example.test", initialMode: "code" });
    expect(screen.getByLabelText(/^email$/i)).toHaveValue("invitee@example.test");
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(mocks.challenge).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(mocks.challenge).toHaveBeenCalledWith("invitee@example.test", "login", "en");
  });

  it("defaults to password login and permits password managers and visibility controls", async () => {
    const { user } = show();
    const password = screen.getByLabelText(/^password$/i);
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText(/^email$/i)).toHaveAttribute("autocomplete", "username");
    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: /verification code/i }));
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
  });

  it("keeps the email, translates a failed password attempt, and allows a corrected retry", async () => {
    mocks.login.mockRejectedValueOnce(new ApiError("wrong", 401, "Unauthorized", { code: "credentials_invalid" }))
      .mockResolvedValueOnce({ id: "user" });
    const { user, onSuccess } = show();
    await enterEmail(user);
    await user.type(screen.getByLabelText(/^password$/i), "wrong");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(enAuth.password_errors.credentials_invalid);
    expect(screen.getByLabelText(/^email$/i)).toHaveValue("user@example.test");
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.workspaces).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/^password$/i));
    await user.type(screen.getByLabelText(/^password$/i), "correct password phrase");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(mocks.login).toHaveBeenLastCalledWith("user@example.test", "correct password phrase");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("allows verification-code login after a rejected password without re-entering the email", async () => {
    mocks.login.mockRejectedValue(new ApiError("wrong", 401, "Unauthorized", { code: "credentials_invalid" }));
    const { user } = show();
    await enterEmail(user);
    await user.type(screen.getByLabelText(/^password$/i), "wrong");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: /verification code/i }));
    expect(screen.getByLabelText(/^email$/i)).toHaveValue("user@example.test");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(mocks.challenge).toHaveBeenCalledWith("user@example.test", "login", "en");
  });

  it("retries workspace loading without authenticating a second time", async () => {
    mocks.login.mockResolvedValue({ id: "user" });
    mocks.workspaces.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
    const { user, onSuccess } = show();
    await enterEmail(user);
    await user.type(screen.getByLabelText(/^password$/i), "a very good password phrase");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await user.click(await screen.findByRole("button", { name: enAuth.password.retry }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(mocks.login).toHaveBeenCalledOnce();
    expect(mocks.workspaces).toHaveBeenCalledTimes(2);
  });

  it("requires a password after a new email is verified", async () => {
    mocks.verify.mockResolvedValue({ action: "signup", proof: "a".repeat(64) });
    mocks.signup.mockResolvedValue({ id: "user" });
    const { user, onSuccess } = show();
    await user.click(screen.getByRole("button", { name: enAuth.password.signup }));
    await enterEmail(user);
    await verifyEmail(user);
    expect(await screen.findByLabelText(/new password/i)).toHaveAttribute("autocomplete", "new-password");
    expect(mocks.signup).not.toHaveBeenCalled();
    const submit = screen.getByRole("button", { name: enAuth.password.create });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/new password/i), "River1234");
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/new password/i), "5");
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(mocks.signup).toHaveBeenCalledWith(expect.objectContaining({ purpose: "signup", proof: "a".repeat(64), password: "River12345" }));
  });

  it("finishes password reset by returning to login", async () => {
    mocks.verify.mockResolvedValue({ action: "reset", proof: "b".repeat(64) });
    mocks.reset.mockResolvedValue(undefined);
    const { user, onSuccess } = show();
    await user.click(screen.getByRole("button", { name: /forgot password/i }));
    await enterEmail(user);
    await verifyEmail(user);
    await user.type(await screen.findByLabelText(/new password/i), "密".repeat(9));
    const submit = screen.getByRole("button", { name: enAuth.password.save });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/new password/i), "密");
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(await screen.findByText(enAuth.password.reset_done)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.workspaces).not.toHaveBeenCalled();
    expect(mocks.reset).toHaveBeenCalledWith(expect.objectContaining({ password: "密".repeat(10) }));
    await user.click(screen.getByRole("button", { name: enAuth.password.back_login }));
    expect(screen.getByLabelText(/^password$/i)).toHaveValue("");
  });
});
