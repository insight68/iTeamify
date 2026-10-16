// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { issueDetailOptions, issueKeys } from "@iteamify/core/issues/queries";
import type { IssueReaction } from "@iteamify/core/types";

const mockGetIssue = vi.hoisted(() => vi.fn());
vi.mock("@iteamify/core/api", () => ({ api: { withRequestContext() { return this; }, getIssue: mockGetIssue } }));
vi.mock("@iteamify/core/realtime", () => ({ useWSEvent: () => {}, useWSReconnect: () => {} }));
vi.mock("@iteamify/core/issues/mutations", () => ({ useToggleIssueReaction: () => ({ mutate: vi.fn() }) }));
import { useIssueReactions } from "./use-issue-reactions";

afterEach(() => vi.clearAllMocks());
function createWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}
it("waits for complete detail and seeds its reactions without a duplicate read", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result, rerender, unmount } = renderHook(
    ({ seed }: { seed: IssueReaction[] | undefined }) => useIssueReactions("i-1", "u-1", seed),
    { initialProps: { seed: undefined as IssueReaction[] | undefined }, wrapper: createWrapper(qc) },
  );
  expect(mockGetIssue).not.toHaveBeenCalled();
  rerender({ seed: [] });
  await waitFor(() => expect(result.current.reactions).toEqual([]));
  expect(qc.getQueryData(issueKeys.reactions("i-1"))).toEqual([]);
  expect(mockGetIssue).not.toHaveBeenCalled();
  unmount();
  qc.clear();
});
it("still reads authoritative reactions after invalidation", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const reaction = { id: "r-1", issue_id: "i-1", actor_id: "u-2", actor_type: "member", emoji: "👍", created_at: "2026-10-10T00:00:00Z" } as IssueReaction;
  mockGetIssue.mockResolvedValue({ reactions: [reaction] });
  const { result, unmount } = renderHook(() => useIssueReactions("i-1", "u-1", []), { wrapper: createWrapper(qc) });
  expect(mockGetIssue).not.toHaveBeenCalled();
  await act(async () => { await qc.invalidateQueries({ queryKey: issueKeys.reactions("i-1") }); });
  await waitFor(() => expect(result.current.reactions).toEqual([reaction]));
  expect(mockGetIssue).toHaveBeenCalledTimes(1);
  unmount();
  qc.clear();
});
it("refreshes reactions when reopening a detail without a second detail request", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const reaction = { id: "r-2", issue_id: "i-1", actor_id: "u-2", actor_type: "member", emoji: "👍", created_at: "2026-10-11T00:00:00Z" } as IssueReaction;
  function useDetailReactions() {
    const { data } = useQuery(issueDetailOptions("ws-1", "i-1", qc));
    return useIssueReactions("i-1", "u-1", data?.reactions);
  }
  mockGetIssue.mockResolvedValue({ reactions: [] });
  const first = renderHook(useDetailReactions, { wrapper: createWrapper(qc) });
  await waitFor(() => expect(qc.getQueryData(issueKeys.reactions("i-1"))).toEqual([]));
  expect(mockGetIssue).toHaveBeenCalledTimes(1);
  first.unmount();

  mockGetIssue.mockResolvedValue({ reactions: [reaction] });
  const reopened = renderHook(useDetailReactions, { wrapper: createWrapper(qc) });
  await waitFor(() => expect(reopened.result.current.reactions).toEqual([reaction]));
  expect(mockGetIssue).toHaveBeenCalledTimes(2);
  reopened.unmount();
  qc.clear();
});
