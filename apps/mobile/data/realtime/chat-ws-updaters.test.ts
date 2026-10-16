import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { ChatDonePayload, ChatMessage } from "@iteamify/core/types";

// chat-ws-updaters imports chatKeys from data/queries/chat, which transitively
// imports the native fetch client. Mock it so the Node test never loads RN
// modules — chatKeys itself is a pure key factory and needs nothing from api.
vi.mock("@/data/api", () => ({ api: {} }));

import { applyChatDoneToCache, appendTaskMessage, updateChatMessages } from "./chat-ws-updaters";
import { chatKeys, loadedChatMessages, taskMessagesOptions, type ChatPages, type TaskMessageSnapshot } from "@/data/queries/chat";
import type { TaskMessagePayload } from "@iteamify/core/types";

const SESSION = "session-1";

function donePayload(over: Partial<ChatDonePayload> = {}): ChatDonePayload {
  return {
    chat_session_id: SESSION,
    task_id: "task-1",
    message_id: "msg-1",
    content: "here is the chart",
    created_at: "2026-07-09T00:00:00Z",
    elapsed_ms: 1200,
    ...over,
  };
}

describe("applyChatDoneToCache", () => {
  it("patches the assistant bubble inline AND invalidates messages so bound attachments refetch", () => {
    const qc = new QueryClient();
    updateChatMessages(qc, SESSION, () => []);
    qc.setQueryData(chatKeys.pendingTask(SESSION), { task_id: "task-1" });
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    applyChatDoneToCache(qc, donePayload());

    // Inline patch: the bubble lands immediately (no flicker) — but without
    // attachments, because the event payload never carries them.
    const msgs = loadedChatMessages(qc.getQueryData<ChatPages>(chatKeys.messages(SESSION)));
    expect(msgs).toHaveLength(1);
    expect(msgs?.[0].id).toBe("msg-1");
    expect(msgs?.[0].attachments).toBeUndefined();

    // Refetch: the authoritative message list (with attachments) is pulled in.
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: chatKeys.messages(SESSION),
    });
    // pendingTask cleared so the status pill unmounts.
    expect(qc.getQueryData(chatKeys.pendingTask(SESSION))).toEqual({});
  });

  it("invalidates even when the payload lacks an inline message (legacy shape)", () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    applyChatDoneToCache(
      qc,
      donePayload({ message_id: undefined, content: undefined, created_at: undefined }),
    );

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: chatKeys.messages(SESSION),
    });
  });

  it("does not duplicate an echoed message on reconnect", () => {
    const qc = new QueryClient();
    const existing: ChatMessage = {
      id: "msg-1",
      chat_session_id: SESSION,
      role: "assistant",
      content: "here is the chart",
      task_id: "task-1",
      created_at: "2026-07-09T00:00:00Z",
    };
    updateChatMessages(qc, SESSION, () => [existing]);

    applyChatDoneToCache(qc, donePayload());

    expect(loadedChatMessages(qc.getQueryData<ChatPages>(chatKeys.messages(SESSION)))).toHaveLength(1);
  });

  it("preserves older cursors and does not clear a newer task for a late completion", () => {
    const qc = new QueryClient();
    const cursor = { created_at: "2026-07-08", id: "older" };
    qc.setQueryData<ChatPages>(chatKeys.messages(SESSION), {
      pages: [{ messages: [], limit: 50, has_more: true, next_cursor: cursor }, { messages: [], limit: 50, has_more: false }],
      pageParams: [null, cursor],
    });
    qc.setQueryData(chatKeys.pendingTask(SESSION), { task_id: "task-2", status: "running" });
    applyChatDoneToCache(qc, donePayload());
    expect(qc.getQueryData<ChatPages>(chatKeys.messages(SESSION))?.pageParams).toEqual([null, cursor]);
    expect(qc.getQueryData<ChatPages>(chatKeys.messages(SESSION))?.pages[0].next_cursor).toEqual(cursor);
    expect(qc.getQueryData(chatKeys.pendingTask(SESSION))).toEqual({ task_id: "task-2", status: "running" });
  });

  it("fetches missing history after an event seeds the cache, preserving concurrent events", async () => {
    const qc = new QueryClient();
    const task = "aaaaaaaa-0000-0000-0000-000000000001";
    const event = (seq: number) => ({ task_id: task, seq, type: "text", content: String(seq) }) as TaskMessagePayload;
    appendTaskMessage(qc, event(4));
    expect(qc.getQueryData<TaskMessageSnapshot>(chatKeys.taskMessages(task))?.hasSnapshot).toBe(false);
    const queryFn = vi.fn(async () => {
      appendTaskMessage(qc, event(5));
      return { messages: [event(1), event(2), event(3), event(4)], hasSnapshot: true };
    });
    await qc.fetchQuery({ ...taskMessagesOptions(task), queryFn });
    appendTaskMessage(qc, event(5));
    const snapshot = qc.getQueryData<TaskMessageSnapshot>(chatKeys.taskMessages(task));
    expect(queryFn).toHaveBeenCalledOnce();
    expect(snapshot?.messages.map((message) => message.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(snapshot?.hasSnapshot).toBe(true);
  });
});
