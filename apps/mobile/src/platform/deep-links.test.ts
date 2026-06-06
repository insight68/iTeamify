import { describe, it, expect, vi } from "vitest";
import { initDeepLinks } from "./deep-links";

describe("initDeepLinks", () => {
  it("returns cleanup function without error on non-native platforms", () => {
    const cleanup = initDeepLinks(vi.fn());
    expect(typeof cleanup).toBe("function");
    cleanup();
  });
});
