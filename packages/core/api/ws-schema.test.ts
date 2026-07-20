import { describe, expect, it } from "vitest";
import { parseWSFrame } from "./ws-schema";

describe("parseWSFrame", () => {
  it("accepts a valid known event", () => {
    expect(parseWSFrame(JSON.stringify({
      type: "task:message",
      payload: { task_id: "t1", issue_id: "i1", seq: 1, type: "text" },
    }))).toMatchObject({ kind: "event", message: { type: "task:message" } });
  });

  it("accepts legacy chat task messages that have no issue or chat session id", () => {
    expect(parseWSFrame(JSON.stringify({
      type: "task:message",
      payload: {
        task_id: "task-1",
        seq: 1,
        type: "thinking",
        content: "Working",
      },
    }))).toMatchObject({
      kind: "event",
      message: {
        type: "task:message",
        payload: {
          task_id: "task-1",
        },
      },
    });
  });

  it("accepts a valid inventory refresh event", () => {
    expect(parseWSFrame(JSON.stringify({
      type: "inventory:updated",
      payload: {
        dataset: "product_order",
        refreshed_at: "2026-07-13T03:00:00Z",
        run_id: "run-42",
      },
    }))).toEqual({
      kind: "event",
      message: {
        type: "inventory:updated",
        payload: {
          dataset: "product_order",
          refreshed_at: "2026-07-13T03:00:00Z",
          run_id: "run-42",
        },
        actor_id: undefined,
      },
    });
  });

  it("accepts a dim_product synchronization event", () => {
    expect(parseWSFrame(JSON.stringify({
      type: "inventory:updated",
      payload: {
        dataset: "dim_product",
        refreshed_at: "2026-07-15T03:00:00Z",
      },
    }))).toMatchObject({
      kind: "event",
      message: { type: "inventory:updated", payload: { dataset: "dim_product" } },
    });
  });

  it.each([
    ["unknown dataset", { dataset: "orders", refreshed_at: "2026-07-13T03:00:00Z" }],
    ["missing refresh timestamp", { dataset: "allocation" }],
    ["empty refresh timestamp", { dataset: "allocation", refreshed_at: "" }],
    ["malformed refresh timestamp", { dataset: "allocation", refreshed_at: "yesterday" }],
    ["non-string run id", { dataset: "product_order", refreshed_at: "2026-07-13T03:00:00Z", run_id: 42 }],
  ])("rejects an inventory refresh event with %s", (_name, payload) => {
    expect(parseWSFrame(JSON.stringify({
      type: "inventory:updated",
      payload,
    }))).toBeNull();
  });

  it.each([
    ["non-string", new Blob(["{}"])],
    ["invalid json", "{"],
    ["unknown event", JSON.stringify({ type: "future:event", payload: {} })],
    ["invalid payload", JSON.stringify({ type: "task:message", payload: { seq: "one" } })],
  ])("rejects %s", (_name, input) => {
    expect(parseWSFrame(input)).toBeNull();
  });

  it("accepts auth acknowledgements separately", () => {
    expect(parseWSFrame(JSON.stringify({ type: "auth_ack", payload: {} }))).toEqual({ kind: "auth_ack" });
  });
});
