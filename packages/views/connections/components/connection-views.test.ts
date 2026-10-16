import { describe, expect, it } from "vitest";
import { resolveConnectionView } from "./connection-views";

describe("resolveConnectionView", () => {
  const allViews = ["apps", "channels", "code"] as const;

  it("keeps a valid URL-selected view", () => {
    expect(resolveConnectionView("channels", allViews)).toBe("channels");
  });

  it("falls back to the first available view for invalid or hidden views", () => {
    expect(resolveConnectionView("unknown", allViews)).toBe("apps");
    expect(resolveConnectionView("code", ["apps", "channels"])).toBe("apps");
  });
});
