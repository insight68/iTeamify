import { describe, expect, it } from "vitest";
import type { ChatTableConfig } from "../types/agent";
import {
  buildAgentTableExportFileName,
  buildAgentTableExportModel,
} from "./table-export";

const config: ChatTableConfig = {
  enabled: true,
  title: "Customer/Table",
  columns: [
    {
      key: "name",
      label: "Name",
      type: "text",
      editable: false,
      visible: true,
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      editable: false,
      visible: true,
      options: [
        { label: "Active", value: "active", color: "#00ff99" },
        { label: "Paused", value: "paused", color: "#ffaa00" },
      ],
    },
    {
      key: "amount",
      label: "Amount",
      type: "number",
      editable: false,
      visible: true,
    },
    {
      key: "internal",
      label: "Internal",
      type: "text",
      editable: false,
      visible: false,
    },
  ],
  filters: [],
  page_size: 20,
  row_color_column: "status",
};

describe("table export", () => {
  it("builds an export model with visible columns, typed cells, and row colors", () => {
    const model = buildAgentTableExportModel({
      config,
      rows: [
        {
          name: "ACME & Sons",
          status: "active",
          amount: 42,
          internal: "secret",
        },
      ],
    });

    expect(model.title).toBe("Customer/Table");
    expect(model.columns.map((column) => column.label)).toEqual([
      "Name",
      "Status",
      "Amount",
    ]);
    expect(model.columns.map((column) => column.key)).not.toContain("internal");
    expect(model.rows).toEqual([
      {
        color: "#00FF99",
        cells: [
          { type: "string", value: "ACME & Sons" },
          { type: "string", value: "Active" },
          { type: "number", value: 42 },
        ],
      },
    ]);
  });

  it("sanitizes generated filenames", () => {
    expect(buildAgentTableExportFileName("A/B:C", new Date("2026-07-05T00:00:00Z")))
      .toBe("A-B-C-2026-07-05.xlsx");
  });
});
