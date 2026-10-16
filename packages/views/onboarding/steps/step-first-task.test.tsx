import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@iteamify/core/i18n/react";
import { EMPTY_QUESTIONNAIRE } from "@iteamify/core/onboarding";
import en from "../../locales/en/onboarding.json";
import { StepFirstTask } from "./step-first-task";
function show(extra: Partial<React.ComponentProps<typeof StepFirstTask>> = {}) {
  const onChange = vi.fn();
  render(<I18nProvider locale="en" resources={{ en: { onboarding: en } }}><StepFirstTask agentName="Helper" answers={EMPTY_QUESTIONNAIRE} title="" description="" pending={false} submitted={false} error="" onChange={onChange} onSubmit={vi.fn()} onSkip={vi.fn()} onBack={vi.fn()} {...extra} /></I18nProvider>);
  return onChange;
}
describe("first task", () => {
  it("suggests an editable task based on the chosen purpose", () => {
    const change = show({ answers: { ...EMPTY_QUESTIONNAIRE, use_case: ["ship_code"] } });
    expect(change).toHaveBeenCalledWith({ taskTitle: en.step_task.examples.code.title, taskDescription: en.step_task.examples.code.description });
  });
  it("does not overwrite restored input", () => {
    const change = show({ title: "My own task", description: "My request" });
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Task title")).toHaveValue("My own task");
  });
  it("reports a submitted task without claiming execution has begun", () => {
    show({ submitted: true });
    expect(screen.getByRole("status")).toHaveTextContent(en.step_task.submitted);
    expect(screen.getByRole("button", { name: en.step_task.open_task })).toBeEnabled();
    expect(screen.queryByLabelText("Task title")).not.toBeInTheDocument();
  });
  it("keeps an uncertain submission immutable while allowing receipt recovery", () => {
    show({ locked: true, title: "Saved", description: "Same request", error: "Connection lost" });
    expect(screen.getByLabelText("Task title")).toBeDisabled();
    expect(screen.getByRole("button", { name: en.step_task.submit })).toBeEnabled();
  });
});
