import { describe, expect, it } from "vitest";
import {
  isReconciliationNavVisible,
  withReconciliationNavVisible,
} from "./settings";

describe("reconciliation workspace settings", () => {
  it("hides the sidebar item by default for missing or malformed settings", () => {
    expect(isReconciliationNavVisible(undefined)).toBe(false);
    expect(isReconciliationNavVisible(null)).toBe(false);
    expect(isReconciliationNavVisible({})).toBe(false);
    expect(isReconciliationNavVisible({ reconciliation: "bad" })).toBe(false);
    expect(isReconciliationNavVisible({ reconciliation: { nav_visible: "no" } })).toBe(false);
  });

  it("reads explicit module and legacy sidebar visibility", () => {
    expect(isReconciliationNavVisible({ modules: { reconciliation: { nav_visible: true } } })).toBe(true);
    expect(isReconciliationNavVisible({ modules: { reconciliation: { nav_visible: false } } })).toBe(false);
    expect(isReconciliationNavVisible({ reconciliation: { nav_visible: true } })).toBe(true);
    expect(isReconciliationNavVisible({ reconciliation: { nav_visible: false } })).toBe(false);
  });

  it("sets sidebar visibility without mutating or dropping other settings", () => {
    const settings = {
      theme: "quiet",
      reconciliation: {
        default_filter: { platform: "shop" },
      },
    };

    const next = withReconciliationNavVisible(settings, false);

    expect(next).toEqual({
      theme: "quiet",
      modules: {
        reconciliation: {
          nav_visible: false,
        },
      },
      reconciliation: {
        default_filter: { platform: "shop" },
      },
    });
    expect(settings).toEqual({
      theme: "quiet",
      reconciliation: {
        default_filter: { platform: "shop" },
      },
    });
  });
});
