import { describe, it, expect, beforeEach } from "vitest";
import { createMobileLocaleAdapter } from "./i18n-adapter";

describe("createMobileLocaleAdapter", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns user choice from localStorage when set", () => {
    localStorage.setItem("teamify-locale", "zh-Hans");
    const adapter = createMobileLocaleAdapter("en");
    expect(adapter.getUserChoice()).toBe("zh-Hans");
  });

  it("returns null user choice when not set", () => {
    const adapter = createMobileLocaleAdapter("en");
    expect(adapter.getUserChoice()).toBeNull();
  });

  it("returns system preferences from constructor arg", () => {
    const adapter = createMobileLocaleAdapter("zh-Hans");
    expect(adapter.getSystemPreferences()).toEqual(["zh-Hans"]);
  });

  it("returns empty system preferences when no locale provided", () => {
    const adapter = createMobileLocaleAdapter("");
    expect(adapter.getSystemPreferences()).toEqual([]);
  });

  it("persists locale to localStorage", () => {
    const adapter = createMobileLocaleAdapter("en");
    adapter.persist("zh-Hans");
    expect(localStorage.getItem("teamify-locale")).toBe("zh-Hans");
  });
});
