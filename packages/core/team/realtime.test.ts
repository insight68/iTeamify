import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { applyDirectEvent } from "./realtime";
import { upsertDirectSession } from "./mutations";
import { teamKeys } from "./queries";
import type { DirectMessagesPage, DirectSession, SessionsPage } from "./types";

const ws = "10000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000001";
const message = { chat_session_id: other, id: "30000000-0000-4000-8000-000000000001", sender_id: other, client_message_id: "40000000-0000-4000-8000-000000000001", sequence: 1, content: "hello", created_at: "2026-10-09T01:00:00Z" };
const page: DirectMessagesPage = { messages: [], has_more: false, next_cursor: null, read_sequence: 0, can_send: true };

describe("private realtime cache", () => {
  it("deduplicates acknowledgements and excludes another workspace or a malformed event", () => {
    const qc = new QueryClient();
    const key = teamKeys.messages(ws, "me", other);
    qc.setQueryData(key, { pages: [page], pageParams: [null] });
    qc.setQueryData(teamKeys.activity(other,"me"), []);
    const payload = { workspace_id: ws, other_user_id: other, message };
    applyDirectEvent(qc, ws, "me", { ...payload, workspace_id: other });
    expect(qc.getQueryState(teamKeys.activity(other,"me"))?.isInvalidated).toBe(true);
    applyDirectEvent(qc, ws, "me", { ...payload, message: { content: "bad" } });
    expect(qc.getQueryData(key)).toEqual({ pages: [page], pageParams: [null] });
    applyDirectEvent(qc, ws, "me", payload);
    applyDirectEvent(qc, ws, "me", payload);
    expect(qc.getQueryData<{ pages: DirectMessagesPage[] }>(key)?.pages[0]?.messages).toEqual([message]);
    qc.clear();
  });
  it("clears only the session whose latest sequence was read, preserving a concurrent newer unread message", () => {
    const qc = new QueryClient();
    const session: DirectSession = { id: other, workspace_id: ws, kind: "direct", peer_user_id: other, title: "hello", has_unread: true, last_sequence: 2, last_message_at: message.created_at, last_message_content: "newer", created_at: message.created_at };
    const listKey = teamKeys.sessions(ws, "me", other);
    qc.setQueryData(listKey, { pages: [{ sessions: [session], next_cursor: null }], pageParams: [null] });
    qc.setQueryData(teamKeys.session(ws, "me", other), session);
    const payload = { workspace_id: ws, other_user_id: other, chat_session_id: other };
    const row = () => qc.getQueryData<{ pages: SessionsPage<DirectSession>[] }>(listKey)!.pages[0]!.sessions[0]!;
    applyDirectEvent(qc, ws, "me", { ...payload, read_sequence: 1 });
    expect(row().has_unread).toBe(true);
    applyDirectEvent(qc, ws, "me", { ...payload, read_sequence: 2 });
    expect(row().has_unread).toBe(false);
    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(false);
    qc.clear();
  });
  it("refetches a loaded transcript only when an incoming message leaves a sequence gap", () => {
    const qc = new QueryClient();
    const key = teamKeys.messages(ws, "me", other);
    qc.setQueryData(key, { pages: [page], pageParams: [null] });
    applyDirectEvent(qc, ws, "me", { workspace_id: ws, other_user_id: other, message });
    expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
    applyDirectEvent(qc, ws, "me", { workspace_id: ws, other_user_id: other, message: { ...message, id: ws, sequence: 3 } });
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
    qc.clear();
  });
  it("recovers the first private acknowledgement for a composing query before its HTTP receipt arrives", () => {
    const qc = new QueryClient();
    const key = teamKeys.messages(ws, other, other);
    qc.getQueryCache().build(qc, { queryKey: key });
    applyDirectEvent(qc, ws, other, { workspace_id: ws, other_user_id: other, message });
    const data = qc.getQueryData<{ pages: DirectMessagesPage[] }>(key)!;
    expect(data.pages[0]?.messages).toEqual([message]);
    expect(data.pages[0]?.read_sequence).toBe(1);
    qc.clear();
  });
  it("keeps the newer preview and cleared unread state when a delayed receipt or replay arrives", () => {
    const qc = new QueryClient();
    const session: DirectSession = { id: other, workspace_id: ws, kind: "direct", peer_user_id: other, title: "hello", has_unread: false, last_sequence: 2, last_message_at: message.created_at, last_message_content: "newer", created_at: message.created_at };
    upsertDirectSession(qc, ws, "me", session);
    upsertDirectSession(qc, ws, "me", { ...session, last_sequence: 1, last_message_content: "older", has_unread: true });
    upsertDirectSession(qc, ws, "me", { ...session, has_unread: true });
    expect(qc.getQueryData(teamKeys.session(ws, "me", other))).toEqual(session);
    qc.clear();
  });
});

it("reading discussion messages retains an unread business update", () => {
  const qc = new QueryClient();
  const session: DirectSession = { id: other, workspace_id: ws, kind: "direct", peer_user_id: other, title: "Contract", has_unread: true, container: {type:"contract_review"}, container_has_unread:true, last_sequence: 2, last_message_at: message.created_at, last_message_content: "Discuss", created_at: message.created_at };
  const listKey = teamKeys.sessions(ws, "me", other);
  qc.setQueryData(listKey, {pages:[{sessions:[session],next_cursor:null}],pageParams:[null]});
  qc.setQueryData(teamKeys.session(ws,"me",other), session);
  applyDirectEvent(qc, ws, "me", {workspace_id:ws,other_user_id:other,chat_session_id:other,read_sequence:2});
  expect(qc.getQueryData<DirectSession>(teamKeys.session(ws,"me",other))?.has_unread).toBe(true);
  qc.clear();
});
