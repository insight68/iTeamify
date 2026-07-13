import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";
import type { ChatTableConfig } from "@teamify/core/types";
import { createAgentTableXlsxExportFile } from "./agent-table-xlsx-export";

const config: ChatTableConfig = {
  enabled: true,
  title: "订单对账",
  columns: [
    {
      key: "order_no",
      label: "原始订单号",
      type: "text",
      editable: false,
      visible: true,
      width: 180,
    },
    {
      key: "status",
      label: "对账状态",
      type: "select",
      editable: false,
      visible: true,
      options: [{ label: "匹配", value: "matched", color: "#3dc417" }],
    },
    {
      key: "amount",
      label: "收入金额",
      type: "number",
      editable: false,
      visible: true,
    },
    {
      key: "internal",
      label: "内部字段",
      type: "text",
      editable: false,
      visible: false,
    },
  ],
  filters: [],
  page_size: 20,
  row_color_column: "status",
};

describe("createAgentTableXlsxExportFile", () => {
  it("creates a single-sheet xlsx table with row colors and typed cells", async () => {
    const exportFile = await createAgentTableXlsxExportFile({
      config,
      rows: [
        {
          order_no: "P792331914815422112",
          status: "matched",
          amount: 79.7,
          internal: "secret",
        },
      ],
      fileName: "订单对账-2026-07-05.xlsx",
    });

    expect(exportFile.fileName).toBe("订单对账-2026-07-05.xlsx");
    const buffer = await exportFile.blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4B);

    const workbook = new Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.worksheets).toHaveLength(1);

    const worksheet = workbook.worksheets[0];
    expect(worksheet).toBeDefined();
    if (!worksheet) throw new Error("Expected workbook to contain one worksheet");
    expect(worksheet.name).toBe("订单对账");
    expect(worksheet.getRow(1).values).toEqual([
      undefined,
      "原始订单号",
      "对账状态",
      "收入金额",
    ]);
    expect(worksheet.getRow(2).values).toEqual([
      undefined,
      "P792331914815422112",
      "匹配",
      79.7,
    ]);
    expect(worksheet.getCell(2, 1).numFmt).toBe("@");
    expect(worksheet.getCell(2, 3).numFmt).toBe("#,##0.00");
    expect((worksheet.getCell(2, 1).fill as { fgColor?: { argb?: string } }).fgColor?.argb)
      .toBe("FF3DC417");
  });
});
