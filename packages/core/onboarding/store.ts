import { api } from "../api";
import { useAuthStore } from "../auth";
import type { OnboardingCompletionPath, QuestionnaireAnswers } from "./types";
import { acceptCurrentUser, updateCurrentUser } from "../profile/queries";

/** Save a field patch through the same current-user mutation as profile forms. */
export async function saveQuestionnaire(
  answers: Partial<QuestionnaireAnswers>,
): Promise<void> {
  await updateCurrentUser({ questionnaire: answers });

}

/**
 * Finalize onboarding. POST /complete marks `onboarded_at` atomically
 * (COALESCE-guarded for idempotency) and emits the `onboarding_completed`
 * analytics event exactly once. Its receipt updates the shared cache so every
 * gate sees the updated user — most importantly the workspace layout
 * hard gate that redirects un-onboarded users back to /onboarding.
 *
 * The four-step flow calls this after submitting its first task, or when
 * the user explicitly chooses to explore the workspace first. Assistant
 * preparation and task creation use the existing generic API endpoints.
 */
export async function completeOnboarding(
  completionPath?: OnboardingCompletionPath,
  workspaceId?: string,
): Promise<void> {
  const state = useAuthStore.getState();
  if (!state.user) throw new DOMException("Session changed", "AbortError");
  const userId = state.user.id;
  const generation = state.sessionGeneration;
  const user = await api.markOnboardingComplete(
    completionPath || workspaceId
      ? { completion_path: completionPath, workspace_id: workspaceId }
      : undefined,
  );
  acceptCurrentUser(user, userId, generation);
}

/**
 * Records interest in cloud runtimes. Pure side effect — does NOT
 * complete onboarding; the user still has to pick a real Step 3
 * path (CLI with a detected runtime) or Skip to move on.
 *
 * Returned user object is not synced into the auth store because no
 * user-visible field (`onboarded_at`, anything in `UserResponse`)
 * actually changes here.
 */
export async function joinCloudWaitlist(
  email: string,
  reason: string,
): Promise<void> {
  await api.joinCloudWaitlist({ email, reason });
}
