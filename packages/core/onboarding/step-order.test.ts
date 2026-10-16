import { describe, expect, it } from "vitest";
import { parseOnboardingStep, resolveOnboardingStep } from "./step-order";
import { paths } from "../paths/paths";

describe("onboarding navigation", () => {
  it("builds resumable routes and rejects unknown steps", () => {
    expect(paths.onboarding("task", "ws one")).toBe("/onboarding?step=task&workspace=ws+one");
    expect(parseOnboardingStep("task")).toBe("task");
    expect(parseOnboardingStep("unknown")).toBeNull();
  });
  it("requires a real workspace before preparing or assigning work", () => {
    expect(resolveOnboardingStep("task", false, true)).toBe("workspace");
    expect(resolveOnboardingStep("assistant", false, false)).toBe("workspace");
  });
  it("requires a ready assistant, but allows recovery of an already submitted task", () => {
    expect(resolveOnboardingStep("task", true, false)).toBe("assistant");
    expect(resolveOnboardingStep("task", true, false, true)).toBe("task");
    expect(resolveOnboardingStep("task", true, true)).toBe("task");
  });
  it("allows returning to optional profile information", () => {
    expect(resolveOnboardingStep("profile", true, true)).toBe("profile");
  });
});
