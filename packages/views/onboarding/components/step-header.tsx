"use client";

import {
  ONBOARDING_STEP_ORDER,
  type OnboardingStep,
} from "@iteamify/core/onboarding";
import { cn } from "@iteamify/ui/lib/utils";
import { useT } from "../../i18n";

/** Shared progress and named steps for web and desktop. */
export function StepHeader({ currentStep }: { currentStep: OnboardingStep }) {
  const { t } = useT("onboarding");
  const total = ONBOARDING_STEP_ORDER.length;
  const currentIndex = ONBOARDING_STEP_ORDER.indexOf(currentStep);
  // Defensive: unknown step → render a disabled-looking header rather
  // than throw. Happens if the caller's local step union and the store
  // enum drift during refactors.
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;

  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={safeIndex + 1}
      aria-valuetext={t(($) => $.step_header.labels[ONBOARDING_STEP_ORDER[safeIndex]!])}
      aria-label={t(($) => $.step_header.step_of, { current: safeIndex + 1, total })}
      className="flex w-full items-center justify-between py-2"
    >
      <div className="flex items-center gap-2">
        {ONBOARDING_STEP_ORDER.map((stepId, i) => {
          const isDone = i < safeIndex;
          const isCurrent = i === safeIndex;
          return (
            <span
              key={stepId}
              aria-hidden
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                isDone && "bg-primary",
                isCurrent && "bg-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-background",
                !isDone && !isCurrent && "bg-muted",
              )}
            />
          );
        })}
        <span className="ml-2 text-xs font-medium text-foreground">{t(($) => $.step_header.labels[ONBOARDING_STEP_ORDER[safeIndex]!])}</span>
      </div>
      <span className="text-xs font-medium text-muted-foreground">
        {t(($) => $.step_header.step_of, { current: safeIndex + 1, total })}
      </span>
    </div>
  );
}
