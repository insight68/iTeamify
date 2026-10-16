import type { OnboardingStep } from "./types";

export const ONBOARDING_STEP_ORDER: readonly OnboardingStep[] = [
  "profile", "workspace", "assistant", "task",
];

export function parseOnboardingStep(value: string | null | undefined): OnboardingStep | null {
  return ONBOARDING_STEP_ORDER.find((step) => step === value) ?? null;
}

/** URL hints never override missing or revoked server prerequisites. */
export function resolveOnboardingStep(
  requested: OnboardingStep,
  workspaceReady: boolean,
  assistantReady: boolean,
  taskSubmitted = false,
): OnboardingStep {
  if ((requested === "assistant" || requested === "task") && !workspaceReady) return "workspace";
  if (requested === "task" && !assistantReady && !taskSubmitted) return "assistant";
  return requested;
}
