import { describe, expect, it } from "vitest";
import { resolveDownloadUrl } from "./distribution.mjs";

describe("public distribution configuration", () => {
  it("keeps internal builds offline", () => expect(resolveDownloadUrl({})).toBe(""));
  it.each(["http://example.com", "https://secret@example.com", "https://example.com?token=secret", "https://example.com/#fragment"])("rejects unsafe or credential-bearing URLs: %s", (url) => {
    expect(() => resolveDownloadUrl({ DESKTOP_DOWNLOAD_URL: url })).toThrow();
  });
  it("normalizes the public release base", () => {
    expect(resolveDownloadUrl({ DESKTOP_DOWNLOAD_URL: "https://github.com/example/releases/releases/latest/download/" })).toBe("https://github.com/example/releases/releases/latest/download");
  });
});
