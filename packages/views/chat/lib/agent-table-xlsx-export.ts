import {
  buildAgentTableExportFileName,
  buildAgentTableExportModel,
  type AgentTableExportInput,
  type AgentTableExportModel,
} from "@teamify/core/chat/table-export";

export interface AgentTableExportFile {
  blob: Blob;
  fileName: string;
}

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const HEADER_FILL = "FFF3F4F6";
const BORDER_COLOR = "FFD1D5DB";

type ExcelJsRuntime = typeof import("exceljs");
type ExcelJsRuntimeWithDefault = ExcelJsRuntime & {
  default?: ExcelJsRuntime;
};

export async function createAgentTableXlsxExportFile(
  input: AgentTableExportInput & { fileName?: string },
): Promise<AgentTableExportFile> {
  const model = buildAgentTableExportModel(input);
  const excelJsModule = await import("exceljs") as ExcelJsRuntimeWithDefault;
  const ExcelJS = excelJsModule.default ?? excelJsModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Teamify";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(sanitizeWorksheetName(model.title), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  writeTable(worksheet, model);

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    blob: new Blob([buffer], { type: XLSX_MIME_TYPE }),
    fileName: input.fileName ?? buildAgentTableExportFileName(model.title),
  };
}

function writeTable(
  worksheet: import("exceljs").Worksheet,
  model: AgentTableExportModel,
): void {
  worksheet.columns = model.columns.map((column) => ({
    header: column.label,
    key: column.key,
    width: toExcelColumnWidth(column.width),
  }));

  const headerRow = worksheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.border = cellBorder();
    cell.numFmt = "@";
  });

  for (const row of model.rows) {
    const excelRow = worksheet.addRow(row.cells.map((cell) => cell.value));
    excelRow.eachCell({ includeEmpty: true }, (cell, index) => {
      const sourceCell = row.cells[index - 1];
      cell.alignment = { vertical: "top", horizontal: "left" };
      cell.border = cellBorder();
      if (sourceCell?.type === "number") {
        cell.numFmt = "#,##0.00";
      } else if (sourceCell?.type === "string") {
        cell.numFmt = "@";
      }
      if (row.color) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: toArgb(row.color) },
        };
      }
    });
  }

  if (model.columns.length > 0) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: model.columns.length },
    };
  }
}

function cellBorder(): Partial<import("exceljs").Borders> {
  return {
    top: { style: "thin", color: { argb: BORDER_COLOR } },
    left: { style: "thin", color: { argb: BORDER_COLOR } },
    bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    right: { style: "thin", color: { argb: BORDER_COLOR } },
  };
}

function toArgb(hexColor: string): string {
  return `FF${hexColor.replace("#", "").toUpperCase()}`;
}

function toExcelColumnWidth(pixelWidth: number): number {
  return Math.min(80, Math.max(10, Math.round(pixelWidth / 8)));
}

function sanitizeWorksheetName(name: string): string {
  const safe = name.replace(/[[\]:*?/\\]/g, " ").trim() || "Table";
  return safe.slice(0, 31);
}
