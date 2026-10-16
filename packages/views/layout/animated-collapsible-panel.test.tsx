import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  getAnimatedCollapsiblePanelInitialOpen,
  useAnimatedCollapsiblePanelState,
} from "./animated-collapsible-panel";

describe("animated collapsible panel state", () => {
  it("uses a restored collapsed layout before falling back to the default", () => {
    expect(
      getAnimatedCollapsiblePanelInitialOpen(true, {
        content: 100,
        sidebar: 0,
      }),
    ).toBe(false);
  });

  it("uses a restored expanded layout before falling back to the default", () => {
    expect(
      getAnimatedCollapsiblePanelInitialOpen(false, {
        content: 70,
        sidebar: 30,
      }),
    ).toBe(true);
  });

  it("falls back to the caller default when no sidebar layout was restored", () => {
    expect(getAnimatedCollapsiblePanelInitialOpen(true, undefined)).toBe(true);
    expect(getAnimatedCollapsiblePanelInitialOpen(false, { content: 100 })).toBe(false);
  });

  it("can restore a named left panel", () => {
    expect(
      getAnimatedCollapsiblePanelInitialOpen(true, { list: 0, detail: 100 }, "list"),
    ).toBe(false);
  });

  it("treats a non-zero layout percentage as open even before pixels are measured", () => {
    const { result } = renderHook(() => useAnimatedCollapsiblePanelState(false));

    act(() => {
      result.current.handleResize({
        asPercentage: 30,
        inPixels: 0,
      });
    });

    expect(result.current.open).toBe(true);
    expect(result.current.visualOpen).toBe(true);
    expect(result.current.motionEnabled).toBe(false);
  });

  it("enables motion only for an explicit toggle window", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useAnimatedCollapsiblePanelState(false));

      expect(result.current.motionEnabled).toBe(false);

      act(() => {
        result.current.beginToggle(true);
      });

      expect(result.current.open).toBe(true);
      expect(result.current.visualOpen).toBe(true);
      expect(result.current.motionEnabled).toBe(true);

      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.motionEnabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
