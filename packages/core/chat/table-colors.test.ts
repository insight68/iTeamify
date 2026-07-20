import { describe, expect, it } from "vitest";
import type { ChatTableConfig } from "../types/agent";
import {
  getAgentTableRowBackground,
  getAgentTableRowColor,
  getTableCellValue,
  normalizeHexColor,
} from "./table-colors";

const config: ChatTableConfig = {
  enabled: true,
  title: "Customers",
  columns: [
    {
      key: "status",
      label: "Status",
      type: "select",
      editable: false,
      visible: true,
      options: [
        { label: "Active", value: "active", color: "#0f9" },
        { label: "Paused", value: "paused", color: "FFAA00" },
      ],
    },
  ],
  filters: [],
  page_size: 20,
  row_color_column: "status",
};

describe("table colors", () => {
  it("normalizes short and long hex colors", () => {
    expect(normalizeHexColor("#0f9")).toBe("#00FF99");
    expect(normalizeHexColor("ffaa00")).toBe("#FFAA00");
    expect(normalizeHexColor("nope")).toBeNull();
  });

  it("reads values by exact key and lowercase fallback", () => {
    expect(getTableCellValue({ Status: "missing", status: "active" }, "status")).toBe("active");
    expect(getTableCellValue({ status: "active" }, "Status")).toBe("active");
  });

  it("returns the configured row color and UI background", () => {
    const row = { status: "active" };

    expect(getAgentTableRowColor(config, row)).toBe("#00FF99");
    expect(getAgentTableRowBackground(config, row)).toBe("rgba(0, 255, 153, 0.1)");
  });

  it("returns null when no matching colored option exists", () => {
    expect(getAgentTableRowColor(config, { status: "unknown" })).toBeNull();
  });
});
