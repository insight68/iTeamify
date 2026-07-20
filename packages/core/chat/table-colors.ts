import type { ChatTableConfig } from "../types/agent";
import { hexToRowBackground, isValidHexColor } from "../utils";

export function normalizeHexColor(color: string | undefined | null): string | null {
  if (!color || !isValidHexColor(color)) return null;
  const hex = color.replace(/^#/, "");
  const expanded = hex.length === 3
    ? hex
      .split("")
      .map((c) => c + c)
      .join("")
    : hex;
  return `#${expanded.toUpperCase()}`;
}

export function getTableCellValue(
  row: Record<string, unknown>,
  key: string,
): unknown {
  if (key in row) return row[key];
  const lower = key.toLowerCase();
  if (lower in row) return row[lower];
  return undefined;
}

export function getAgentTableRowColor(
  config: ChatTableConfig,
  row: Record<string, unknown>,
): string | null {
  if (!config.row_color_column) return null;

  const column = config.columns.find((c) => c.key === config.row_color_column);
  if (!column || column.type !== "select" || !column.options) return null;

  const cellValue = getTableCellValue(row, config.row_color_column);
  const option = column.options.find((o) => o.value === cellValue);
  return normalizeHexColor(option?.color);
}

export function getAgentTableRowBackground(
  config: ChatTableConfig,
  row: Record<string, unknown>,
): string | null {
  const color = getAgentTableRowColor(config, row);
  if (!color) return null;
  return hexToRowBackground(color) || null;
}
