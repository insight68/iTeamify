import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNavigation } from "@teamify/views/navigation";

// Must import after mocks are set up
import { MobileNavigationProvider } from "./navigation";

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MobileNavigationProvider>{children}</MobileNavigationProvider>
  );
}

describe("MobileNavigationProvider", () => {
  it("provides a navigation adapter via context", () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });
    expect(result.current).toBeDefined();
    expect(typeof result.current.push).toBe("function");
    expect(typeof result.current.replace).toBe("function");
    expect(typeof result.current.back).toBe("function");
    expect(typeof result.current.getShareableUrl).toBe("function");
  });

  it("has correct initial pathname", () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });
    expect(result.current.pathname).toBe("/");
  });

  it("generates shareable URLs with app URL prefix", () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });
    const url = result.current.getShareableUrl("/issues");
    expect(url).toContain("/issues");
  });
});
