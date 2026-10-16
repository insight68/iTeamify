// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLogout } from "./use-logout";

// Storage ordering is tested in core/platform/session-cleanup.test.ts.
// This view must delegate cleanup before ending auth and navigating.
const state = vi.hoisted(() => ({
  calls: [] as string[],
  cleanup: vi.fn(),
  logout: vi.fn(),
  push: vi.fn(),
  queryClient: {},
  storage: {},
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => state.queryClient,
}));
vi.mock("@iteamify/core/auth", () => ({
  useAuthStore: Object.assign(
    (selector: (s: { logout: typeof state.logout }) => unknown) =>
      selector({ logout: state.logout }),
    { getState: () => ({ logout: state.logout }) },
  ),
}));
vi.mock("@iteamify/core/platform", () => ({
  clearClientSessionData: state.cleanup,
  defaultStorage: state.storage,
}));
vi.mock("@iteamify/core/paths", () => ({ paths: { login: () => "/login" } }));
vi.mock("../navigation", () => ({
  useNavigation: () => ({ push: state.push }),
}));
describe("useLogout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.calls.length = 0;
    state.cleanup.mockImplementation(() => state.calls.push("cleanup"));
    state.logout.mockImplementation(() => state.calls.push("logout"));
    state.push.mockImplementation(() => state.calls.push("navigate"));
  });
  it("cleans the session before logging out and navigating", () => {
    const { result } = renderHook(() => useLogout());
    result.current();
    expect(state.cleanup).toHaveBeenCalledWith(
      state.queryClient,
      state.storage,
    );
    expect(state.calls).toEqual(["cleanup", "logout", "navigate"]);
    expect(state.push).toHaveBeenCalledWith("/login");
  });
});
