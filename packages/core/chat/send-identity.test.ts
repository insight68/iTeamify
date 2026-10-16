import { afterEach, expect, it } from "vitest";
import { chatSendIdentity, clearChatSendIdentity } from "./send-identity";

const key = "ws:user:new:agent:draft";
afterEach(() => { clearChatSendIdentity(key); clearChatSendIdentity("another-workspace:draft"); });

it("reuses session and message IDs after a lost response, with independent identities for a changed payload or workspace", () => {
  const first = chatSendIdentity(key, "agent", "hello");
  expect(chatSendIdentity(key, "agent", "hello")).toEqual(first);
  const changed = chatSendIdentity(key, "agent", "changed");
  expect(changed.sessionId).toBe(first.sessionId);
  expect(changed.messageId).not.toBe(first.messageId);
  const anotherWorkspace = chatSendIdentity("another-workspace:draft", "agent", "hello");
  expect(anotherWorkspace.sessionId).not.toBe(first.sessionId);
  clearChatSendIdentity(key);
  expect(chatSendIdentity(key, "agent", "hello").messageId).not.toBe(first.messageId);
});
