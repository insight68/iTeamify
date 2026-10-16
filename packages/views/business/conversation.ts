import { DRAFT_NEW_SESSION } from "@iteamify/core/chat";
import type { UpsertChatContextResourceInput } from "@iteamify/core/types";

interface BusinessConversationChatState {
  selectedAgentId: string | null;
  inputDrafts: Record<string, string>;
  setActiveSession: (id: string | null) => void;
  setSelectedProjectId: (id: string | null) => void;
  setPendingContextResources?: (resources: UpsertChatContextResourceInput[]) => void;
  setInputDraft: (sessionId: string, draft: string) => void;
  appendToInputDraft: (sessionId: string, markdown: string) => void;
}

/**
 * Prepare the real shared Chat composer for a business interview.
 *
 * Existing unsent text is preserved and the interview prompt is appended.
 * Returns the stored agent id so the caller can navigate to the full Chat
 * page, where the draft and the selected agent are waiting.
 */
export function prepareBusinessConversation(
  chat: BusinessConversationChatState,
  prompt: string,
): string | null {
  const currentDraft = chat.inputDrafts[DRAFT_NEW_SESSION]?.trim();
  chat.setActiveSession(null);
  chat.setSelectedProjectId(null);
  chat.setPendingContextResources?.([
    { resource_type: "company_profile", resource_id: "current", source: "page" },
  ]);
  if (currentDraft) chat.appendToInputDraft(DRAFT_NEW_SESSION, prompt);
  else chat.setInputDraft(DRAFT_NEW_SESSION, prompt);

  return chat.selectedAgentId;
}
