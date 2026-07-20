"use client";

import { useState, useCallback, useMemo, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Lock,
  Unlock,
  Download,
  Filter,
} from "lucide-react";
import {
  useConfirmWorkspaceReconciliation,
  useUnlockWorkspaceReconciliation,
  useExportReconciliation,
} from "@teamify/core/reconciliation";
import { DataTable } from "@teamify/ui/components/ui/data-table";
import { DataTableColumnHeader } from "@teamify/ui/components/ui/data-table-column-header";
import { Button } from "@teamify/ui/components/ui/button";
import { Input } from "@teamify/ui/components/ui/input";
import { Checkbox } from "@teamify/ui/components/ui/checkbox";
import { Badge } from "@teamify/ui/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@teamify/ui/components/ui/dropdown-menu";
import type { ChatTableColumn, ChatTableFilter } from "@teamify/core/types";
import { cn } from "@teamify/ui/lib/utils";
import { ConfirmationBadge } from "./confirmation-badge";
import { useWorkspacePaths } from "@teamify/core/paths";
import { useNavigation } from "../../navigation";
import { downloadBlob } from "../../common/download-blob";
import { useT } from "../../i18n";
import { toast } from "sonner";
import {
  type ColumnDef,
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
} from "@tanstack/react-table";

// ── Types ──

interface SummaryData {
  rows?: Record<string, unknown>[];
  total?: number;
  confirmation_status?: Record<string, {
    confirmed: boolean;
    confirmed_by?: string;
    confirmed_at?: string;
    locked: boolean;
    locked_at?: string;
    locked_by?: string;
    status?: string;
    unlockable?: boolean;
  }>;
}

interface ReconciliationSummaryPanelProps {
  columns: ChatTableColumn[];
  filters: ChatTableFilter[];
  batchNoColumn: string;
  data: SummaryData | undefined;
  isLoading: boolean;
  onRefresh: () => void;
  onFiltersChange: (filters: Record<string, unknown>) => void;
  onPageChange: (page: number) => void;
  page: number;
  pageSize: number;
  wsId: string;
  title?: string;
  confirmable?: boolean;
  onBatchOpen?: (batchNo: string) => void;
  headerAction?: ReactNode;
}

interface TableRowData {
  _rowIndex: number;
  [key: string]: unknown;
}

type FilterOption = NonNullable<ChatTableFilter["options"]>[number];

// ── Component ──

/**
 * Reconciliation summary table panel with confirmation workflow.
 *
 * Data-source-agnostic: the parent experience owns the workspace query and
 * passes results in via props. This component handles only rendering,
 * selection, confirm/unlock, export, and drill-down navigation.
 */
export function ReconciliationSummaryPanel({
  columns,
  filters: filterConfigs,
  batchNoColumn,
  data,
  isLoading,
  onRefresh,
  onFiltersChange,
  onPageChange,
  page,
  pageSize,
  wsId,
  title,
  confirmable = true,
  onBatchOpen,
  headerAction,
}: ReconciliationSummaryPanelProps) {
  const { t } = useT("agents");
  const wsPaths = useWorkspacePaths();
  const navigation = useNavigation();

  // Local filter input state (text inputs); lifted up on change.
  const [filterDraft, setFilterDraft] = useState<Record<string, string>>({});
  const [selectedBatchNos, setSelectedBatchNos] = useState<Set<string>>(new Set());

  // ── mutations ──
  const confirmMutation = useConfirmWorkspaceReconciliation(wsId);
  const unlockMutation = useUnlockWorkspaceReconciliation(wsId);
  const exportMutation = useExportReconciliation();

  const rows = useMemo<TableRowData[]>(() => {
    if (!data?.rows) return [];
    return data.rows.map((row, i) => ({ _rowIndex: i, ...row }));
  }, [data?.rows]);

  const filterOptionsByKey = useMemo(() => {
    const optionsByKey = new Map<string, FilterOption[]>();
    for (const filter of filterConfigs) {
      if (filter.type !== "select" && filter.type !== "multi_select") continue;
      if (filter.options?.length) {
        optionsByKey.set(filter.key, filter.options);
        continue;
      }
      const dynamicOptions = new Map<string, FilterOption>();
      for (const row of rows) {
        const rawValue = row[filter.key];
        if (rawValue == null) continue;
        const value = String(rawValue).trim();
        if (!value) continue;
        dynamicOptions.set(value, { label: value, value });
      }
      optionsByKey.set(
        filter.key,
        Array.from(dynamicOptions.values()).sort((a, b) =>
          a.label.localeCompare(b.label, "zh-Hans"),
        ),
      );
    }
    return optionsByKey;
  }, [filterConfigs, rows]);

  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / pageSize);

  // ── filter handlers ──
  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilterDraft((prev) => ({ ...prev, [key]: value }));
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries({ ...filterDraft, [key]: value })) {
      if (v) next[k] = v;
    }
    onFiltersChange(next);
    onPageChange(1);
  }, [filterDraft, onFiltersChange, onPageChange]);

  // ── selection handlers ──
  const handleSelectBatch = useCallback((batchNo: string, checked: boolean) => {
    setSelectedBatchNos((prev) => {
      const next = new Set(prev);
      if (checked) next.add(batchNo);
      else next.delete(batchNo);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!data?.rows) return;
    const allBatchNos = data.rows
      .map((r: Record<string, unknown>) => r[batchNoColumn] as string)
      .filter((batchNo) => batchNo && !data.confirmation_status?.[batchNo]?.locked);
    setSelectedBatchNos(new Set(allBatchNos));
  }, [data?.rows, data?.confirmation_status, batchNoColumn]);

  const handleClearSelection = useCallback(() => {
    setSelectedBatchNos(new Set());
  }, []);

  // ── action handlers ──
  const handleConfirm = useCallback(() => {
    if (selectedBatchNos.size === 0) return;
    confirmMutation.mutate(Array.from(selectedBatchNos), {
      onSuccess: (result) => {
        const failedBatchNos = new Set(
          result.failed.map((failure) => failure.batch_no).filter(Boolean),
        );
        if (result.failed.some((failure) => failure.code === "invalid_response")) {
          setSelectedBatchNos(new Set(selectedBatchNos));
        } else {
          setSelectedBatchNos(failedBatchNos);
        }
        if (result.failed.length > 0) {
          toast.warning(t(($) => $.tab_body.reconciliation.confirm_partial, {
            confirmed: result.confirmed.length,
            failed: result.failed.length,
          }));
        } else {
          toast.success(t(($) => $.tab_body.reconciliation.confirm_success, {
            count: result.confirmed.length,
          }));
        }
      },
      onError: () => {
        toast.error(t(($) => $.tab_body.reconciliation.confirm_failed));
      },
    });
  }, [selectedBatchNos, confirmMutation, t]);

  const handleUnlock = useCallback((batchNo: string) => {
    unlockMutation.mutate({ batchNo });
  }, [unlockMutation]);

  const handleExport = useCallback(() => {
    const currentFilters: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(filterDraft)) {
      if (v) currentFilters[k] = v;
    }
    exportMutation.mutate(
      { wsId, filters: currentFilters },
      {
        onSuccess: (blob) => {
          downloadBlob(blob, `reconciliation-${new Date().toISOString().split("T")[0]}.csv`);
        },
      },
    );
  }, [wsId, filterDraft, exportMutation]);

  const handleRowClick = useCallback((row: TableRowData) => {
    const batchNo = row[batchNoColumn] as string;
    if (batchNo) {
      if (onBatchOpen) {
        onBatchOpen(batchNo);
      } else {
        navigation.push(wsPaths.reconciliationDetail(batchNo));
      }
    }
  }, [batchNoColumn, navigation, onBatchOpen, wsPaths]);

  const selectedBatchCount = selectedBatchNos.size;
  const confirmDisabled = selectedBatchCount === 0 || confirmMutation.isPending;

  // ── column defs ──
  const visibleColumns = useMemo(
    () => columns.filter((c) => c.visible),
    [columns],
  );

  const tableColumns = useMemo<ColumnDef<TableRowData>[]>(() => {
    const selectCol: ColumnDef<TableRowData> = {
      id: "_select",
      header: () => (
        <span
          className="inline-flex"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={selectedBatchNos.size > 0}
            onCheckedChange={(checked) => {
              if (checked) handleSelectAll();
              else handleClearSelection();
            }}
          />
        </span>
      ),
      cell: ({ row }) => {
        const batchNo = row.original[batchNoColumn] as string;
        const confirmStatus = data?.confirmation_status?.[batchNo];
        return (
          <span
            className="inline-flex"
            onClick={(event) => event.stopPropagation()}
          >
            <Checkbox
              checked={selectedBatchNos.has(batchNo)}
              onCheckedChange={(checked) => handleSelectBatch(batchNo, !!checked)}
              disabled={confirmStatus?.locked}
            />
          </span>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 40,
    };

    const statusCol: ColumnDef<TableRowData> = {
      id: "_status",
      header: ({ column }) => <DataTableColumnHeader column={column} label={t(($) => $.tab_body.reconciliation.status_heading)} />,
      cell: ({ row }) => {
        const batchNo = row.original[batchNoColumn] as string;
        const confirmStatus = data?.confirmation_status?.[batchNo];
        return (
          <div className="flex items-center gap-2">
            <ConfirmationBadge
              confirmed={confirmStatus?.confirmed}
              locked={confirmStatus?.locked}
            />
            {confirmable && confirmStatus?.unlockable && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnlock(batchNo);
                }}
                disabled={unlockMutation.isPending}
              >
                <Unlock className="h-3 w-3" />
              </Button>
            )}
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 120,
    };

    const dataCols: ColumnDef<TableRowData>[] = visibleColumns.map((col) => ({
      id: col.key,
      accessorKey: col.key,
      header: ({ column }) => <DataTableColumnHeader column={column} label={col.label} />,
      cell: ({ row }) => {
        const value = row.original[col.key];
        if (value == null) return null;
        if (col.type === "number") {
          return <span className="font-mono">{String(value)}</span>;
        }
        if (col.type === "date") {
          return <span>{String(value)}</span>;
        }
        if (col.type === "select" && col.options) {
          const opt = col.options.find((o) => o.value === value);
          return <Badge variant="outline">{opt?.label ?? String(value ?? "")}</Badge>;
        }
        return <span>{String(value ?? "")}</span>;
      },
      size: col.width ?? undefined,
    }));

    return confirmable ? [selectCol, ...dataCols, statusCol] : [...dataCols, statusCol];
  }, [visibleColumns, selectedBatchNos, data?.confirmation_status, batchNoColumn, handleSelectBatch, handleSelectAll, handleClearSelection, handleUnlock, unlockMutation.isPending, confirmable, t]);

  // ── table instance ──
  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount,
  });

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{title || t(($) => $.tab_body.reconciliation.default_title)}</h3>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t(($) => $.tab_body.reconciliation.records_count, { count: total })}
          </span>
        </div>

        <div className="flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2">
          {confirmable && selectedBatchCount > 0 && (
            <Badge variant="secondary">
              {t(($) => $.tab_body.reconciliation.selected_batches, { count: selectedBatchCount })}
            </Badge>
          )}

          {confirmable && selectedBatchCount > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={handleConfirm}
              disabled={confirmDisabled}
            >
              <Lock className="h-3 w-3 mr-1" />
              {t(($) => $.tab_body.reconciliation.confirm_selected)}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportMutation.isPending}
          >
            <Download className="h-3 w-3 mr-1" />
            {t(($) => $.tab_body.reconciliation.export)}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
          </Button>

          {headerAction ? (
            <div className="flex shrink-0 items-center">{headerAction}</div>
          ) : null}
        </div>
      </div>

      {/* Filters */}
      {filterConfigs.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
          <Filter className="h-3 w-3 text-muted-foreground" />
          {filterConfigs.map((f) => (
            <FilterControl
              key={f.key}
              filter={f}
              value={filterDraft[f.key] ?? ""}
              options={filterOptionsByKey.get(f.key) ?? []}
              onChange={(value) => handleFilterChange(f.key, value)}
            />
          ))}
        </div>
      )}

      {/* Table */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DataTable
          table={table}
          onRowClick={(row) => handleRowClick(row.original as TableRowData)}
        />
      </div>

      {/* Pagination */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t(($) => $.tab_body.reconciliation.page_indicator, { page, pageCount: pageCount || 1 })}
          </span>
          {confirmable && selectedBatchCount > 0 && (
            <Badge variant="secondary">
              {t(($) => $.tab_body.reconciliation.selected_batches, { count: selectedBatchCount })}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {confirmable && (
            <Button
              variant="default"
              size="sm"
              onClick={handleConfirm}
              disabled={confirmDisabled}
            >
              <Lock className="h-3 w-3 mr-1" />
              {t(($) => $.tab_body.reconciliation.confirm)}
            </Button>
          )}
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
    </div>
  );
}

function FilterControl({
  filter,
  value,
  options,
  onChange,
}: {
  filter: ChatTableFilter;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  if (filter.type === "select" || filter.type === "multi_select") {
    return (
      <SelectFilterControl
        filter={filter}
        value={value}
        options={options}
        onChange={onChange}
      />
    );
  }

  return (
    <Input
      aria-label={filter.label}
      type={filter.type === "date" ? "date" : "text"}
      placeholder={filter.label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-36 text-xs"
    />
  );
}

function SelectFilterControl({
  filter,
  value,
  options,
  onChange,
}: {
  filter: ChatTableFilter;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  const selectedOption = options.find((opt) => opt.value === value);
  const hasValue = value.length > 0;
  const displayLabel = hasValue
    ? selectedOption?.label ?? value
    : filter.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={`${filter.label}筛选`}
        className={cn(
          "flex h-7 max-w-44 min-w-32 items-center gap-1.5 rounded border border-input bg-background px-2 text-xs transition-colors outline-none select-none",
          "hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          hasValue ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {displayLabel}
        </span>
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem
          className="text-muted-foreground"
          onClick={() => onChange("")}
        >
          {filter.label}
        </DropdownMenuItem>
        {options.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={value}
              onValueChange={(nextValue) => onChange(nextValue || "")}
            >
              {options.map((opt) => (
                <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                  {opt.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
