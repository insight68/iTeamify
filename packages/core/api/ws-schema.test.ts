import { describe, expect, it } from "vitest";
import { parseWSFrame } from "./ws-schema";

describe("parseWSFrame", () => {
  it("accepts a valid known event", () => {
    expect(parseWSFrame(JSON.stringify({
      type: "task:message",
      payload: { task_id: "t1", issue_id: "i1", seq: 1, type: "text" },
    }))).toMatchObject({ kind: "event", message: { type: "task:message" } });
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
