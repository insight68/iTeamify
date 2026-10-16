import { describe, expect, it } from "vitest";
import { isPublicCapabilityPath } from "./public-route-mode";

describe("isPublicCapabilityPath", () => {
  it.each([
    "/experts",
    "/experts/acme",
    "/experts/acme?c=conversation-1",
    "/purchase",
    "/purchase/signed-token",
  ])("keeps %s outside the member session bootstrap", (path) => {
    expect(isPublicCapabilityPath(path)).toBe(true);
  });

  it.each(["/", "/login", "/acme/chat"])(
    "keeps %s in its existing session mode",
    (path) => expect(isPublicCapabilityPath(path)).toBe(false),
  );
});
