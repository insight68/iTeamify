import { describe, expect, it } from "vitest";
import { workspaceUrlHost } from "./workspace-url";

describe("workspaceUrlHost", () => {
  it("returns the host of a full app URL", () => {
    expect(workspaceUrlHost("https://iteamify.example.com")).toBe(
      "iteamify.example.com",
    );
  });

  it("ignores scheme, path, and trailing slash", () => {
    expect(workspaceUrlHost("https://iteamify.example.com/")).toBe(
      "iteamify.example.com",
    );
    expect(workspaceUrlHost("http://iteamify.example.com/app/onboarding")).toBe(
      "iteamify.example.com",
    );
  });

  it("preserves a non-default port", () => {
    expect(workspaceUrlHost("https://my.host:3000")).toBe("my.host:3000");
  });

  it("accepts a bare host without a scheme", () => {
    expect(workspaceUrlHost("iteamify.example.com")).toBe("iteamify.example.com");
    expect(workspaceUrlHost("iteamify.example.com/path")).toBe(
      "iteamify.example.com",
    );
  });

  it("falls back to the brand host when no app URL is configured", () => {
    expect(workspaceUrlHost("")).toBe("aurocreator.com");
    expect(workspaceUrlHost("   ")).toBe("aurocreator.com");
    expect(workspaceUrlHost(null)).toBe("aurocreator.com");
    expect(workspaceUrlHost(undefined)).toBe("aurocreator.com");
  });
});
