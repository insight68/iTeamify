import { describe, expect, it, vi } from "vitest";
import { DRAFT_NEW_SESSION } from "@iteamify/core/chat";
import { prepareBusinessConversation } from "./conversation";

function makeChat(overrides: Partial<Parameters<typeof prepareBusinessConversation>[0]> = {}) {
  return {
    selectedAgentId: "agent-1",
    inputDrafts: {},
    setActiveSession: vi.fn(),
    setSelectedProjectId: vi.fn(),
    setPendingContextResources: vi.fn(),
    setInputDraft: vi.fn(),
    appendToInputDraft: vi.fn(),
    ...overrides,
  };
}

describe("prepareBusinessConversation", () => {
  it("places the interview in an empty new-chat draft and returns the agent", () => {
    const chat = makeChat();

    const agent = prepareBusinessConversation(chat, "Interview me");

    expect(agent).toBe("agent-1");
    expect(chat.setActiveSession).toHaveBeenCalledWith(null);
    expect(chat.setSelectedProjectId).toHaveBeenCalledWith(null);
    expect(chat.setPendingContextResources).toHaveBeenCalledWith([
      { resource_type: "company_profile", resource_id: "current", source: "page" },
    ]);
    expect(chat.setInputDraft).toHaveBeenCalledWith(DRAFT_NEW_SESSION, "Interview me");
  });

  it("preserves an existing unsent draft and appends the prompt", () => {
    const chat = makeChat({
      inputDrafts: { [DRAFT_NEW_SESSION]: "Existing thought" },
    });

    const agent = prepareBusinessConversation(chat, "Improve our ICP");

    expect(agent).toBe("agent-1");
    expect(chat.appendToInputDraft).toHaveBeenCalledWith(
      DRAFT_NEW_SESSION,
      "Improve our ICP",
    );
    expect(chat.setInputDraft).not.toHaveBeenCalled();
  });
});
