import { describe, expect, it } from "vitest";
import { ChatMessagesPageSchema, AgentTaskSchema } from "./schemas";
import { CancelTaskResponseSchema, ChatDraftRestoresResponseSchema } from "@iteamify/core/api/schemas";

describe("mobile chat response compatibility", () => {
  it("rejects malformed message pages instead of treating them as messages", () => {
    expect(ChatMessagesPageSchema.safeParse({ messages: "bad", has_more: true }).success).toBe(false);
  });
  it("does not accept a malformed restore for consuming or rendering", () => {
    expect(ChatDraftRestoresResponseSchema.safeParse({ restores: [{ id: "x", content: {} }] }).success).toBe(false);
    expect(CancelTaskResponseSchema.safeParse({ cancelled_chat_message: "bad" }).success).toBe(false);
  });
  it.each(["provider_rate_limited", "provider_new_reason"])("preserves additive task failure reason %s", (reason) => {
    const task = AgentTaskSchema.parse({ id: "task", agent_id: "agent", failure_reason: reason });
    expect(task.failure_reason).toBe(reason);
  });
});
