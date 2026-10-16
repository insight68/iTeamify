import { describe, expect, it, vi } from "vitest";
import type { InboxItem } from "@iteamify/core/types";
import { QueryClient } from "@tanstack/react-query";

const harness = vi.hoisted(() => ({ qc: null as QueryClient | null }));
vi.mock("@/data/api", () => ({ api: { markInboxRead: vi.fn() } }));
vi.mock("@/data/workspace-store", () => ({
  useWorkspaceStore: (select: (state: { currentWorkspaceId: string }) => unknown) => select({ currentWorkspaceId: "ws" }),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => harness.qc,
    // Exercise the real mutation lifecycle without a native React renderer.
    useMutation: (options: ConstructorParameters<typeof actual.MutationObserver>[1]) => {
      const observer = new actual.MutationObserver(harness.qc!, options);
      return { mutateAsync: (id: never) => observer.mutate(id) };
    },
  };
});
import { api } from "@/data/api";
import { inboxKeys } from "@/data/queries/inbox";
import { useMarkInboxRead } from "./inbox";

describe("notification read state", () => {
  it("keeps the synchronous read patch during cancellation and rolls back on failure", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    harness.qc = qc;
    const key = inboxKeys.list("ws");
    qc.setQueryData<InboxItem[]>(key, [{ id: "notice", read: false } as InboxItem]);
    const refetch = qc.fetchQuery({ queryKey: key, queryFn: () => new Promise<InboxItem[]>(() => {}) }).catch(() => {});
    let reject!: (error: Error) => void;
    vi.mocked(api.markInboxRead).mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    const mutation = useMarkInboxRead().mutateAsync("notice");
    const failure = expect(mutation).rejects.toThrow("offline");
    await vi.waitFor(() => expect(reject).toBeDefined());
    expect(qc.getQueryData<InboxItem[]>(key)?.[0].read).toBe(true);
    reject(new Error("offline"));
    await failure;
    await refetch;
    expect(qc.getQueryData<InboxItem[]>(key)?.[0].read).toBe(false);
    qc.clear();
  });
});
