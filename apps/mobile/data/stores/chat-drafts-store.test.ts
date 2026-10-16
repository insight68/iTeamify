import { beforeEach, describe, expect, it } from "vitest";
import { chatDraftKey, useChatDraftsStore } from "./chat-drafts-store";

describe("chat draft recovery", () => {
  beforeEach(() => useChatDraftsStore.setState(useChatDraftsStore.getInitialState()));

  it("applies HTTP and reconnect echoes of the same stopped message only once", () => {
    const restore = { id: "message", chat_session_id: "chat", content: "stopped text", attachments: [] };
    useChatDraftsStore.getState().enqueueRestore(restore);
    useChatDraftsStore.getState().enqueueRestore({ ...restore, serverRestoreId: restore.id });
    expect(useChatDraftsStore.getState().restores).toHaveLength(1);
    useChatDraftsStore.getState().applyRestore(restore.id);
    useChatDraftsStore.getState().enqueueRestore(restore);
    expect(useChatDraftsStore.getState().restores).toEqual([]);
    expect(useChatDraftsStore.getState().appliedRestoreIds[restore.id]).toBe(true);
  });

  it("moves new-session text without overwriting another workspace's draft", () => {
    const store = useChatDraftsStore.getState();
    store.setDraft(chatDraftKey("A", null), "typed during send");
    store.setDraft(chatDraftKey("B", null), "other workspace");
    store.promoteNewDraft("A", "new-chat");
    expect(useChatDraftsStore.getState().drafts).toEqual({
      [chatDraftKey("A", "new-chat")]: "typed during send",
      [chatDraftKey("B", null)]: "other workspace",
    });
  });
});
