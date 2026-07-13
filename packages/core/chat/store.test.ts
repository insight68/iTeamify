import { afterEach, describe, expect, it } from "vitest";
import { setCurrentWorkspace } from "../platform/workspace-storage";
import type { StorageAdapter } from "../types";
import { createChatStore } from "./store";

function makeStorage(initial: Record<string, string> = {}): StorageAdapter & {
  snapshot: () => Record<string, string>;
} {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
    snapshot: () => ({ ...data }),
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

afterEach(() => {
  setCurrentWorkspace(null, null);
});

describe("chat store table column sizing", () => {
  it("loads and sanitizes persisted table column widths", () => {
    const storage = makeStorage({
      "teamify:chat:tableColumnSizing": JSON.stringify({
        table: { id: 144.4, bad: "wide", zero: 0 },
      }),
    });

    const store = createChatStore({ storage });

    expect(store.getState().tableColumnSizing).toEqual({
      table: { id: 144 },
    });
  });

  it("persists table column widths and prunes empty entries", () => {
    const storage = makeStorage();
    const store = createChatStore({ storage });

    store.getState().setTableColumnSizing("table", { id: 240, name: 320.7 });

    const persisted = storage.snapshot()["teamify:chat:tableColumnSizing"];
    expect(persisted).toBeDefined();
    expect(JSON.parse(persisted ?? "{}")).toEqual({
      table: { id: 240, name: 321 },
    });

    store.getState().setTableColumnSizing("table", {});

    expect(storage.snapshot()["teamify:chat:tableColumnSizing"]).toBeUndefined();
  });

  it("rehydrates table column widths when the workspace changes", async () => {
    setCurrentWorkspace("alpha", "ws-alpha");
    const storage = makeStorage({
      "teamify:chat:tableColumnSizing:alpha": JSON.stringify({
        table: { id: 180 },
      }),
      "teamify:chat:tableColumnSizing:beta": JSON.stringify({
        table: { id: 260 },
      }),
    });
    const store = createChatStore({ storage });

    expect(store.getState().tableColumnSizing).toEqual({
      table: { id: 180 },
    });

    setCurrentWorkspace("beta", "ws-beta");
    await flushMicrotasks();

    expect(store.getState().tableColumnSizing).toEqual({
      table: { id: 260 },
    });
  });
});
