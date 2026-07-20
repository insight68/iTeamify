import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../api/client";
import { setApiInstance } from "../api";
import { fetchAllAgentTableRows } from "./table-queries";

afterEach(() => {
  vi.restoreAllMocks();
  setApiInstance({} as ApiClient);
});

describe("fetchAllAgentTableRows", () => {
  it("fetches every page for the active filters", async () => {
    const fetchAgentTableData = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ id: 1 }, { id: 2 }],
        total: 3,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 3 }],
        total: 3,
      });

    setApiInstance({ fetchAgentTableData } as unknown as ApiClient);

    const result = await fetchAllAgentTableRows("agent-1", {
      filters: { status: "active" },
    });

    expect(result).toEqual({
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
      total: 3,
    });
    expect(fetchAgentTableData).toHaveBeenCalledTimes(2);
    expect(fetchAgentTableData).toHaveBeenNthCalledWith(1, "agent-1", {
      filters: { status: "active" },
      page: 1,
      pageSize: 1000,
    });
    expect(fetchAgentTableData).toHaveBeenNthCalledWith(2, "agent-1", {
      filters: { status: "active" },
      page: 2,
      pageSize: 1000,
    });
  });

  it("stops if a later page returns no rows", async () => {
    const fetchAgentTableData = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ id: 1 }],
        total: 3,
      })
      .mockResolvedValueOnce({
        rows: [],
        total: 3,
      });

    setApiInstance({ fetchAgentTableData } as unknown as ApiClient);

    const result = await fetchAllAgentTableRows("agent-1");

    expect(result).toEqual({
      rows: [{ id: 1 }],
      total: 3,
    });
    expect(fetchAgentTableData).toHaveBeenCalledTimes(2);
  });
});
