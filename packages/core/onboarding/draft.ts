import { z } from "zod";
import { createDraftStore } from "../drafts/create-draft-store";

export { EMPTY_QUESTIONNAIRE, readQuestionnaire } from "../profile/questionnaire";
const draftSchema = z.object({
  ownerId: z.string(), step: z.enum(["profile", "workspace", "assistant", "task"]),
  workspaceId: z.string(), runtimeId: z.string(), agentId: z.string(), issueId: z.string(),
  workspaceName: z.string(), workspaceSlug: z.string(), workspaceSlugTouched: z.boolean(),
  taskTitle: z.string(), taskDescription: z.string(),
  taskAttempted: z.boolean(),
  taskSubmission: z.object({ title: z.string(), description: z.string(), agentId: z.string() }).nullable(),
});
export type OnboardingDraft = z.infer<typeof draftSchema>;
export const EMPTY_ONBOARDING_DRAFT: OnboardingDraft = {
  ownerId: "", step: "profile", workspaceId: "", runtimeId: "", agentId: "", issueId: "",
  workspaceName: "", workspaceSlug: "", workspaceSlugTouched: false,
  taskTitle: "", taskDescription: "", taskAttempted: false, taskSubmission: null,
};

/** Only unsaved input and client-owned resume pointers are persisted. */
export const useOnboardingDraftStore = createDraftStore<OnboardingDraft>({
  storageKey: "iteamify_onboarding_draft", workspaceScoped: false,
  emptyData: EMPTY_ONBOARDING_DRAFT,
  hasMeaningful: (draft) => !!draft.ownerId,
  migrateData: (raw) => {
    const parsed = draftSchema.safeParse(raw);
    return parsed.success ? parsed.data : EMPTY_ONBOARDING_DRAFT;
  },
});
