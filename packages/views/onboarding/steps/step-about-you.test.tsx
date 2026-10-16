import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@iteamify/core/i18n/react";
import { personalProfile, type PersonalProfile } from "@iteamify/core/profile";
import { EMPTY_USER } from "@iteamify/core/api/schemas";
import enSettings from "../../locales/en/settings.json";
import enOnboarding from "../../locales/en/onboarding.json";
import { StepAboutYou } from "./step-about-you";

function renderStep(patch: Partial<PersonalProfile> = {}) {
  const onChange = vi.fn();
  const onAdvance = vi.fn();
  const onSkip = vi.fn();
  render(<I18nProvider locale="en" resources={{ en: { settings: enSettings, onboarding: enOnboarding } }}>
    <StepAboutYou value={{ ...personalProfile({ ...EMPTY_USER, name: "Tester" }), ...patch }}
      onAvatarUploaded={vi.fn()} onChange={onChange} onAdvance={onAdvance} onSkip={onSkip} />
  </I18nProvider>);
  return { onChange, onAdvance, onSkip };
}

describe("StepAboutYou", () => {
  it("asks for a free-text role with examples and removes the use-case question", () => {
    renderStep();
    expect(screen.getByLabelText(enOnboarding.questions.role.question)).toHaveValue("");
    expect(screen.getByText(enOnboarding.questions.about_you.role_hint)).toBeInTheDocument();
    expect(screen.queryByText(enOnboarding.questions.use_case.question)).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("accepts a profession outside the former role choices", () => {
    const { onChange, onAdvance } = renderStep();
    fireEvent.change(screen.getByLabelText(enOnboarding.questions.role.question), { target: { value: "律师" } });
    expect(onChange).toHaveBeenLastCalledWith({ role: "other", role_other: "律师", role_skipped: false });
    expect(onAdvance).not.toHaveBeenCalled();
  });
  it("displays an existing selected role as text", () => {
    renderStep({ role: "engineer" });
    expect(screen.getByLabelText(enOnboarding.questions.role.question)).toHaveValue("Engineer / developer");
  });
  it("restores a custom role verbatim", () => {
    renderStep({ role: "other", role_other: "独立开发者" });
    expect(screen.getByLabelText(enOnboarding.questions.role.question)).toHaveValue("独立开发者");
  });
  it("allows a blank role and Later does not clear saved profile fields", async () => {
    const { onChange, onAdvance, onSkip } = renderStep();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Fill in later" }));
    expect(onAdvance).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });
  it("does not advance while confirming composed text", () => {
    const { onAdvance } = renderStep();
    fireEvent.keyDown(screen.getByLabelText(enOnboarding.questions.role.question), { key: "Enter", isComposing: true });
    expect(onAdvance).not.toHaveBeenCalled();
  });
});
