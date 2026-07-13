import type { ChatTableColumn, ChatTableConfig } from "../types/agent";
import {
  getAgentTableRowColor,
  getTableCellValue,
} from "./table-colors";

export interface AgentTableExportInput {
  config: ChatTableConfig;
  rows: Record<string, unknown>[];
}

export interface AgentTableExportColumn {
  key: string;
  label: string;
  type: ChatTableColumn["type"];
  width: number;
}

export interface AgentTableExportCell {
  value: string | number | boolean | null;
  type: "string" | "number" | "boolean";
}

export interface AgentTableExportRow {
  color: string | null;
  cells: AgentTableExportCell[];
}

export interface AgentTableExportModel {
  title: string;
  columns: AgentTableExportColumn[];
  rows: AgentTableExportRow[];
}

export function buildAgentTableExportFileName(
  title: string | undefined,
  date = new Date(),
): string {
  const base = sanitizeFileName(title?.trim() || "agent-table");
  return `${base}-${formatDate(date)}.xlsx`;
}

export function buildAgentTableExportModel({
  config,
  rows,
}: AgentTableExportInput): AgentTableExportModel {
  const columns = getVisibleColumns(config).map((column) => ({
    key: column.key,
    label: column.label || column.key,
    type: column.type,
    width: getColumnWidth(column),
  }));

  return {
    title: config.title || config.data_table_name || "Table",
    columns,
    rows: rows.map((row) => ({
      color: getAgentTableRowColor(config, row),
      cells: columns.map((column) => {
        const sourceColumn = config.columns.find((c) => c.key === column.key);
        return formatCellValue(
          sourceColumn ?? {
            key: column.key,
            label: column.label,
            type: column.type,
            editable: false,
            visible: true,
          },
          getTableCellValue(row, column.key),
        );
      }),
    })),
  };
}

function formatCellValue(
  column: ChatTableColumn,
  value: unknown,
): AgentTableExportCell {
  if (value == null) return { type: "string", value: null };

  if (column.type === "select" && column.options) {
    const option = column.options.find((o) => o.value === value);
    return { type: "string", value: option?.label ?? String(value) };
  }

  if (column.type === "number") {
    const numeric = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numeric)) {
      return { type: "number", value: numeric };
    }
  }

  if (column.type === "boolean") {
    if (typeof value === "boolean") {
      return { type: "boolean", value };
    }
    if (value === "true" || value === "false") {
      return { type: "boolean", value: value === "true" };
    }
  }

  return { type: "string", value: String(value) };
}

function getVisibleColumns(config: ChatTableConfig): ChatTableColumn[] {
  return config.columns.filter((column) => column.visible);
}

function getColumnWidth(column: ChatTableColumn): number {
  if (column.width && column.width > 0) return column.width;
  return column.grow ? 220 : 150;
}

function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex -- Exclude ASCII control characters for safe filenames
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ").trim() || "agent-table";
}

function formatDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
