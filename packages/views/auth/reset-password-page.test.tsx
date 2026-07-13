import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { I18nProvider } from "@teamify/core/i18n/react";
import enCommon from "../locales/en/common.json";
import enAuth from "../locales/en/auth.json";
import { ResetPasswordPage } from "./reset-password-page";

const TEST_RESOURCES = {
  en: { common: enCommon, auth: enAuth },
};

const mockResetPasswordSendCode = vi.hoisted(() => vi.fn());
const mockResetPasswordVerify = vi.hoisted(() => vi.fn());

vi.mock("@teamify/core/api", () => ({
  api: {
    resetPasswordSendCode: mockResetPasswordSendCode,
    resetPasswordVerify: mockResetPasswordVerify,
  },
}));

function I18nWrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      {children}
    </I18nProvider>
  );
}

function renderWithI18n(ui: ReactElement) {
  return render(ui, { wrapper: I18nWrapper });
}

function getOTPInput() {
  return screen.getByRole("textbox", { hidden: true });
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResetPasswordSendCode.mockResolvedValue(undefined);
    mockResetPasswordVerify.mockResolvedValue(undefined);
  });

  it("collects the new password before verifying the reset code", async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    renderWithI18n(<ResetPasswordPage onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.click(screen.getByRole("button", { name: /send reset code/i }));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });

    await user.type(getOTPInput(), "123456");

    await waitFor(() => {
      expect(screen.getByText(/set new password/i)).toBeInTheDocument();
    });
    expect(mockResetPasswordVerify).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^password$/i), "password123");
    await user.type(screen.getByLabelText(/confirm password/i), "password123");
    await user.click(screen.getByRole("button", { name: /^reset password$/i }));

    await waitFor(() => {
      expect(mockResetPasswordVerify).toHaveBeenCalledWith(
        "test@example.com",
        "123456",
        "password123",
      );
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
