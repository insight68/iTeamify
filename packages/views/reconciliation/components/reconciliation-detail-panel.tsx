"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { DataTable } from "@teamify/ui/components/ui/data-table";
import { DataTableColumnHeader } from "@teamify/ui/components/ui/data-table-column-header";
import { Button } from "@teamify/ui/components/ui/button";
import { Badge } from "@teamify/ui/components/ui/badge";
import type { ChatTableColumn } from "@teamify/core/types";
import { useT } from "../../i18n";
import {
  type ColumnDef,
  useReactTable,
  getCoreRowModel,
} from "@tanstack/react-table";

interface TableRowData {
  _rowIndex: number;
  [key: string]: unknown;
}

interface DetailData {
  rows?: Record<string, unknown>[];
  total?: number;
}

interface ReconciliationDetailPanelProps {
  batchNo: string;
  data: DetailData | undefined;
  isLoading: boolean;
  onRefresh: () => void;
  page: number;
  onPageChange: (page: number) => void;
  detailColumns?: ChatTableColumn[];
}

const PAGE_SIZE = 50;

/**
 * Drill-down detail table showing entries for a specific document.
 *
 * Data-source-agnostic: the parent page owns the query and passes results in.
 * Column definitions come from the workspace reconciliation config.
 */
export function ReconciliationDetailPanel({
  batchNo,
  data,
  isLoading,
  onRefresh,
  page,
  onPageChange,
  detailColumns = [],
}: ReconciliationDetailPanelProps) {
  const { t } = useT("agents");

  const rows = useMemo<TableRowData[]>(() => {
    if (!data?.rows) return [];
    return data.rows.map((row, i) => ({ _rowIndex: i, ...row }));
  }, [data?.rows]);

  const visibleColumns = useMemo<ChatTableColumn[]>(() => {
    const configured = detailColumns.filter((col) => col.visible);
    if (configured.length > 0) return configured;

    const firstRow = rows[0];
    if (!firstRow) return [];
    return Object.keys(firstRow)
      .filter((key) => key !== "_rowIndex")
      .slice(0, 12)
      .map((key) => ({
        key,
        label: key,
        type: typeof firstRow[key] === "number" ? "number" : "text",
        editable: false,
        visible: true,
      }));
  }, [detailColumns, rows]);

  // ── column defs for detail table ──
  const tableColumns = useMemo<ColumnDef<TableRowData>[]>(() => {
    return visibleColumns.map((col) => ({
      id: col.key,
      accessorKey: col.key,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={col.label} />
      ),
      cell: ({ row }) => {
        const value = row.original[col.key];
        if (value == null) return null;

        if (col.type === "number") {
          return <span className="font-mono">{String(value)}</span>;
        }

        if (col.type === "boolean") {
          return (
            <Badge variant={value ? "default" : "outline"}>
              {value ? "是" : "否"}
            </Badge>
          );
        }

        if (col.type === "select" && col.options) {
          const option = col.options.find((item) => item.value === value);
          return <Badge variant="outline">{option?.label ?? String(value)}</Badge>;
        }

        if (typeof value === "object") {
          return (
            <span className="font-mono text-xs">
              {JSON.stringify(value)}
            </span>
          );
        }

        return <span>{String(value)}</span>;
      },
      size: col.width ?? undefined,
    }));
  }, [visibleColumns]);

  // ── table instance ──
  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  const pageCount = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h3 className="shrink-0 text-sm font-semibold">{t(($) => $.tab_body.reconciliation.detail_heading)}</h3>
          <Badge variant="outline" className="min-w-0 truncate font-mono text-xs">
            {batchNo}
          </Badge>
          <span className="shrink-0 text-xs text-muted-foreground">
            {data ? t(($) => $.tab_body.reconciliation.records_count, { count: data.total ?? 0 }) : "—"}
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {/* Table */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DataTable table={table} />
      </div>

      {/* Pagination */}
      <div className="flex shrink-0 items-center justify-between border-t px-4 py-2">
        <span className="text-xs text-muted-foreground">
          {t(($) => $.tab_body.reconciliation.page_indicator, { page, pageCount: pageCount || 1 })}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
            disabled={page >= pageCount}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
