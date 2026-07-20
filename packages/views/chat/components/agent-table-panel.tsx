"use client";

import {
  type ColumnDef,
  type SortingState,
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
} from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceId } from "@teamify/core/hooks";
import { useAuthStore } from "@teamify/core/auth";
import { api } from "@teamify/core/api";
import {
  agentTableDataOptions,
  tableDataKeys,
} from "@teamify/core/chat/table-queries";
import { useSaveTableData } from "@teamify/core/chat/table-mutations";
import { getAgentTableRowBackground } from "@teamify/core/chat/table-colors";
import {
  buildAgentTableExportXlsxFileName,
} from "@teamify/core/chat/table-export";
import {
  resolveFilterDefault,
  type FilterVariableContext,
} from "@teamify/core/chat/filter-variables";
import { DataTable } from "@teamify/ui/components/ui/data-table";
import { DataTableColumnHeader } from "@teamify/ui/components/ui/data-table-column-header";
import { Button } from "@teamify/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@teamify/ui/components/ui/dropdown-menu";
import type {
  ChatTableConfig,
  ChatTableColumn,
  ChatTableFilter,
} from "@teamify/core/types/agent";
import { cn } from "@teamify/ui/lib/utils";
import { useAgentTableFilterStore } from "@teamify/core/chat";
import { downloadBlob } from "../../common/download-blob";
import { useT } from "../../i18n";

// ── Types ──

interface AgentTablePanelProps {
  config: ChatTableConfig;
  agentId: string;
  /** Chat session ID for scoping agent-directed filter updates. */
  sessionId: string;
  fullscreenControl?: React.ReactNode;
}

interface TableRowData {
  _rowIndex: number;
  [key: string]: unknown;
}

/** Editing state shared across cells via TanStack Table meta. */
interface TableEditMeta {
  editingCell: { rowIdx: number; colKey: string } | null;
  editValue: string;
  startEdit: (rowIdx: number, col: ChatTableColumn, currentValue: unknown) => void;
  setEditValue: (v: string) => void;
  commitEdit: () => void;
  cancelEdit: () => void;
  isSaving: boolean;
}

// Augment TanStack Table's meta type.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TableMeta<TData> extends TableEditMeta {}
}

// ── Row Coloring ──

/**
 * Computes the row style based on the row_color_column configuration.
 * Returns a background color if the designated select column's value
 * matches an option with a configured color.
 */
export function computeRowStyle(
  config: ChatTableConfig,
  rowData: Record<string, unknown>,
): React.CSSProperties {
  const bg = getAgentTableRowBackground(config, rowData);
  return bg ? { backgroundColor: bg } : {};
}

/** Stable empty object reference so Zustand selectors don't loop. */
const EMPTY_FILTERS: Record<string, unknown> = {};

// ── Component ──

/**
 * Inline-editable data table panel rendered above the agent chat.
 *
 * Columns and filters are built dynamically from the agent's
 * `chat_table_config`.  Data is fetched via a WS-proxied MCP tool call
 * through the backend.  Double-clicking an editable cell activates an inline
 * input; blur/Enter commits the change via the same MCP channel.
 */
export function AgentTablePanel({
  config,
  agentId,
  sessionId,
  fullscreenControl,
}: AgentTablePanelProps) {
  const wsId = useWorkspaceId();
  const { t } = useT("chat");
  const authUser = useAuthStore((s) => s.user);

  // Agent-directed filters from the session-scoped store. These are set by
  // the agent via the filter-table webhook and broadcast as WS events.
  const agentFilters = useAgentTableFilterStore(
    (s) => s.sessionFilters[sessionId] ?? EMPTY_FILTERS,
  );

  // Build the filter-variable resolution context once so defaults are
  // resolved consistently at mount time.
  const filterVarContext = React.useMemo<FilterVariableContext>(
    () => ({
      currentUser: authUser
        ? { id: authUser.id, name: authUser.name }
        : null,
      now: new Date(),
    }),
    [authUser?.id, authUser?.name],
  );

  // ── server-side state ──
  const [sorting, setSorting] = React.useState<SortingState>([]);

  // Initialise filters from config defaults (with dynamic variable resolution).
  const [filters, setFilters] = React.useState<Record<string, unknown>>(() => {
    const resolved: Record<string, unknown> = {};
    if (!config?.filters) return resolved;
    for (const f of config.filters) {
      if (f.default_value != null && f.default_value !== "") {
        const val = resolveFilterDefault(f.default_value, filterVarContext);
        if (val !== undefined) {
          const multiValues =
            f.type === "multi_select" ? normalizeFilterValues(val) : null;
          if (multiValues) {
            if (multiValues.length > 0) {
              resolved[f.key] = multiValues;
            }
          } else {
            resolved[f.key] = val;
          }
        }
      }
    }
    return resolved;
  });
  const [page, setPage] = React.useState(1);

  // Debounce filter input so we don't fire a request on every keystroke.
  const [debouncedFilters, setDebouncedFilters] = React.useState<
    Record<string, unknown>
  >({});
  React.useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedFilters(filters),
      300,
    );
    return () => clearTimeout(timer);
  }, [filters]);

  // Reset to page 1 when filters change (server-side filtering).
  React.useEffect(() => {
    setPage(1);
  }, [debouncedFilters]);

  // Merge agent-directed filters with user-set filters. Agent filters take
  // precedence — when the user says "show only active items," the agent's
  // intent overrides whatever was previously set in the UI.
  const effectiveFilters = React.useMemo(
    () => ({ ...debouncedFilters, ...agentFilters }),
    [debouncedFilters, agentFilters],
  );

  // ── client-side state ──
  const [columnPinning, setColumnPinning] = React.useState<{
    left?: string[];
    right?: string[];
  }>({});

  // ── inline editing state ──
  const [editingCell, setEditingCell] = React.useState<{
    rowIdx: number;
    colKey: string;
  } | null>(null);
  const [editValue, setEditValue] = React.useState<string>("");

  const queryClient = useQueryClient();

  // When agent filters change, invalidate and refetch immediately (no debounce).
  React.useEffect(() => {
    if (wsId) {
      queryClient.invalidateQueries({ queryKey: tableDataKeys.all(wsId) });
    }
  }, [agentFilters, wsId, queryClient]);

  const saveMutation = useSaveTableData(wsId);
  const [isExporting, setIsExporting] = React.useState(false);

  // Persist the last save payload for retry.
  const lastSaveRef = React.useRef<{
    agentId: string;
    action: "update" | "create" | "delete";
    row: Record<string, unknown>;
  } | null>(null);

  const pageSize = config.page_size > 0 ? config.page_size : 20;

  // ── data ──
  const { data, isLoading, isError } = useQuery(
    agentTableDataOptions(wsId, agentId, {
      filters: effectiveFilters,
      page,
      pageSize,
    }),
  );

  const apiData = data;

  const rows = React.useMemo<TableRowData[]>(() => {
    if (!apiData?.rows) return [];
    return apiData.rows.map((row, i) => ({ _rowIndex: i, ...row }));
  }, [apiData?.rows]);

  const handleExportAll = React.useCallback(async () => {
    setIsExporting(true);
    try {
      const blob = await api.exportAgentTableData(agentId, effectiveFilters);
      downloadBlob(
        blob,
        buildAgentTableExportXlsxFileName(
          config.title || config.data_table_name || "agent-table",
        ),
      );
      toast.success(t(($) => $.table.export_success));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t(($) => $.table.export_failed),
      );
    } finally {
      setIsExporting(false);
    }
  }, [agentId, config, effectiveFilters, t]);

  // ── editing callbacks (stable refs via useCallback) ──
  const startEdit = React.useCallback(
    (rowIdx: number, _col: ChatTableColumn, currentValue: unknown) => {
      // Find the column config to check editability.
      const colCfg = config.columns.find((c) => c.key === _col.key);
      if (!colCfg?.editable) return;
      setEditingCell({ rowIdx, colKey: _col.key });
      setEditValue(currentValue != null ? String(currentValue) : "");
    },
    [config.columns],
  );

  const commitEdit = React.useCallback(() => {
    if (!editingCell) return;
    const row = rows[editingCell.rowIdx];
    if (!row) {
      setEditingCell(null);
      return;
    }
    const { _rowIndex: _drop, ...rowData } = row;
    const updatedRow = {
      ...rowData,
      [editingCell.colKey]: tryParseEditValue(editValue),
    };

    const payload = { agentId, action: "update" as const, row: updatedRow };
    lastSaveRef.current = payload;
    saveMutation.mutate(payload);
    setEditingCell(null);
  }, [editingCell, editValue, rows, agentId, saveMutation]);

  const cancelEdit = React.useCallback(() => {
    setEditingCell(null);
  }, []);

  // ── columns built from config ──
  const columns = React.useMemo<ColumnDef<TableRowData>[]>(() => {
    const visibleCols = config.columns.filter((c) => c.visible);
    return visibleCols.map((col) => ({
      id: col.key,
      // PostgreSQL folds unquoted identifiers to lowercase, but config keys
      // may use mixed case (e.g. "UserName"). Try the exact key first, then
      // fall back to lowercase — this covers both the direct SQL path
      // (PostgreSQL → lowercase pgx field names) and the MCP path (which
      // returns whatever the tool returns).
      accessorFn: (row) => {
        const r = row as Record<string, unknown>;
        const key = col.key;
        if (key in r) return r[key];
        const lower = key.toLowerCase();
        if (lower in r) return r[lower];
        return undefined;
      },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label={col.label} />
      ),
      size: col.width ?? 150,
      meta: { grow: col.grow },
      cell: ({ row, getValue, table }) => {
        const meta = table.options.meta as TableEditMeta | undefined;
        const isEditing =
          meta?.editingCell?.rowIdx === row.original._rowIndex &&
          meta?.editingCell?.colKey === col.key;

        if (isEditing) {
          return (
            <EditInput
              type={col.type}
              value={meta?.editValue ?? ""}
              options={col.options}
              onChange={(v) => meta?.setEditValue(v)}
              onCommit={() => meta?.commitEdit()}
              onCancel={() => meta?.cancelEdit()}
              disabled={meta?.isSaving}
              t={t}
            />
          );
        }

        const value = getValue();
        const display =
          col.type === "boolean"
            ? value
              ? "✓"
              : "✗"
            : value != null
              ? String(value)
              : "—";

        return (
          <div
            className={cn(
              "truncate select-text",
              col.editable &&
                "cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors",
            )}
            onDoubleClick={() => {
              if (col.editable) startEdit(row.original._rowIndex, col, value);
            }}
            title={col.editable ? "Double-click to edit" : undefined}
          >
            {display}
          </div>
        );
      },
    }));
  }, [config.columns, startEdit, t]);

  // ── table instance ──
  const table = useReactTable<TableRowData>({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    enableSorting: true,
    enableColumnPinning: true,
    onSortingChange: setSorting,
    onColumnPinningChange: setColumnPinning,
    state: {
      sorting,
      columnPinning,
    },
    meta: {
      editingCell,
      editValue,
      startEdit,
      setEditValue,
      commitEdit,
      cancelEdit,
      isSaving: saveMutation.isPending,
    } satisfies TableEditMeta,
  });

  // Guard against partially configured configs (e.g. { enabled: true } with
  // no columns defined).  The editor (`resolveConfig`) prevents this, but an
  // API payload or direct DB edit could still produce a broken shape.
  if (!config.enabled || !config.columns?.length) return null;

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* ── Header: title + filters ── */}
      <div className="flex items-center gap-2 border-b px-4 py-1.5">
        {config.title ? (
          <h4 className="text-xs font-semibold text-muted-foreground shrink-0">
            {config.title}
          </h4>
        ) : null}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {config.filters.map((f) => (
            <FilterChip
              key={f.key}
              filter={f}
              value={filters[f.key]}
              onChange={(v) => {
                // When the user manually changes a filter, clear the
                // agent-directed value for the same key so the user's
                // intent takes precedence.
                const currentAgent = useAgentTableFilterStore.getState()
                  .sessionFilters[sessionId];
                if (currentAgent && f.key in currentAgent) {
                  const nextAgent = { ...currentAgent };
                  delete nextAgent[f.key];
                  useAgentTableFilterStore
                    .getState()
                    .setSessionFilters(
                      sessionId,
                      Object.keys(nextAgent).length > 0 ? nextAgent : {},
                    );
                }
                setFilters((prev) => {
                  if (v === undefined || v === "" || v === null) {
                    const next = { ...prev };
                    delete next[f.key];
                    return next;
                  }
                  return { ...prev, [f.key]: v };
                });
              }}
            />
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {fullscreenControl}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2"
            onClick={handleExportAll}
            disabled={isExporting || isLoading || (data?.total ?? 0) === 0}
            title={isExporting ? t(($) => $.table.exporting) : t(($) => $.table.export_all)}
            aria-label={isExporting ? t(($) => $.table.exporting) : t(($) => $.table.export_all)}
          >
            {isExporting ? (
              <RefreshCw className="size-3 animate-spin" />
            ) : (
              <Download className="size-3" />
            )}
          </Button>
        </div>
        {saveMutation.isPending && (
          <span className="text-[10px] text-muted-foreground animate-pulse">
            {t(($) => $.table.saving)}
          </span>
        )}
        {saveMutation.isError && (
          <button
            type="button"
            className="text-[10px] text-destructive hover:underline"
            onClick={() => {
              if (lastSaveRef.current) {
                saveMutation.mutate(lastSaveRef.current);
              }
            }}
          >
            {t(($) => $.table.save_failed_retry)}
          </button>
        )}
      </div>

      {/* ── Table body ── */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          {t(($) => $.table.loading)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-2 h-32">
          <span className="text-sm text-destructive">
            {config.data_table_name
              ? t(($) => $.table.load_failed_from, { table: config.data_table_name })
              : t(($) => $.table.load_failed)}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: tableDataKeys.all(wsId),
              })
            }
          >
            <RefreshCw className="size-3 mr-1" />
            {t(($) => $.table.retry)}
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable
            table={table}
            emptyMessage={
              config.data_table_name
                ? `Table "${config.data_table_name}" returned 0 rows. Check your data source configuration.`
                : "No rows."
            }
            getRowStyle={(row) =>
              computeRowStyle(config, row.original as Record<string, unknown>)
            }
          />
        </div>
      )}

      {/* ── Footer: row count + pagination + refresh ── */}
      <div className="flex items-center justify-between border-t px-4 py-0.5">
        <span className="text-[10px] text-muted-foreground">
          {data
            ? `${data.total} row${data.total !== 1 ? "s" : ""}`
            : "—"}
        </span>
        <div className="flex items-center gap-1">
          {(() => {
            const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
            return (
              <>
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-default"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  title="Previous page"
                >
                  <ChevronLeft className="size-3" />
                </button>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-default"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  title="Next page"
                >
                  <ChevronRight className="size-3" />
                </button>
              </>
            );
          })()}
          <button
            type="button"
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-2"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: tableDataKeys.all(wsId),
              })
            }
            title="Refresh table data"
          >
            <RefreshCw className="size-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Input ──

function EditInput({
  type,
  value,
  options,
  onChange,
  onCommit,
  onCancel,
  disabled,
  t,
}: {
  type: ChatTableColumn["type"];
  value: string;
  options?: { label: string; value: string }[];
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  disabled?: boolean;
  t: ReturnType<typeof useT<"chat">>["t"];
}) {
  const inputRef = React.useRef<HTMLInputElement | HTMLSelectElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
    if (inputRef.current instanceof HTMLInputElement) {
      inputRef.current.select();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const sharedClass =
    "h-6 w-full rounded border border-primary bg-background px-1 text-xs outline-none";

  if (type === "boolean") {
    return (
      <select
        ref={inputRef as React.Ref<HTMLSelectElement>}
        className={sharedClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      >
        <option value="true">{t(($) => $.table.boolean_true)}</option>
        <option value="false">{t(($) => $.table.boolean_false)}</option>
      </select>
    );
  }

  if (type === "select" && options) {
    return (
      <select
        ref={inputRef as React.Ref<HTMLSelectElement>}
        className={sharedClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      ref={inputRef as React.Ref<HTMLInputElement>}
      type={type === "number" ? "number" : "text"}
      className={sharedClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={handleKeyDown}
      disabled={disabled}
    />
  );
}

// ── Filter Chip ──

function FilterChip({
  filter,
  value,
  onChange,
}: {
  filter: ChatTableFilter;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (filter.type === "select") {
    return (
      <SingleSelectFilterChip
        filter={filter}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (filter.type === "multi_select") {
    return (
      <MultiSelectFilterChip
        filter={filter}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <input
      type="text"
      className="h-6 w-28 rounded border border-input bg-background px-1.5 text-[11px] text-muted-foreground placeholder:text-muted-foreground/50"
      placeholder={filter.label}
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  );
}

function SingleSelectFilterChip({
  filter,
  value,
  onChange,
}: {
  filter: ChatTableFilter;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const selectedValue = value != null ? String(value) : "";
  const selectedOption = filter.options?.find((opt) => opt.value === selectedValue);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={filter.label}
        className={filterTriggerClassName(!!selectedOption)}
      >
        <span className="min-w-0 truncate">
          {selectedOption?.label ?? filter.label}
        </span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem
          className="text-muted-foreground"
          onClick={() => onChange(undefined)}
        >
          {filter.label}
        </DropdownMenuItem>
        {(filter.options?.length ?? 0) > 0 && <DropdownMenuSeparator />}
        <DropdownMenuRadioGroup
          value={selectedValue}
          onValueChange={(nextValue) => onChange(nextValue || undefined)}
        >
          {filter.options?.map((opt) => (
            <DropdownMenuRadioItem key={opt.value} value={opt.value}>
              {opt.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MultiSelectFilterChip({
  filter,
  value,
  onChange,
}: {
  filter: ChatTableFilter;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const selectedValues = normalizeFilterValues(value);
  const selectedSet = React.useMemo(
    () => new Set(selectedValues),
    [selectedValues],
  );
  const selectedLabels =
    filter.options
      ?.filter((opt) => selectedSet.has(opt.value))
      .map((opt) => opt.label) ?? [];
  const displayLabel =
    selectedLabels.length === 0
      ? filter.label
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${filter.label} (${selectedLabels.length})`;

  const toggleValue = React.useCallback(
    (optionValue: string) => {
      const next = new Set(selectedSet);
      if (next.has(optionValue)) {
        next.delete(optionValue);
      } else {
        next.add(optionValue);
      }
      const values = Array.from(next);
      onChange(values.length > 0 ? values : undefined);
    },
    [onChange, selectedSet],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={filter.label}
        className={filterTriggerClassName(selectedValues.length > 0)}
      >
        <span className="min-w-0 truncate">{displayLabel}</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {selectedValues.length > 0 && (
          <>
            <DropdownMenuItem
              className="text-muted-foreground"
              onClick={() => onChange(undefined)}
            >
              {filter.label}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {filter.options?.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt.value}
            checked={selectedSet.has(opt.value)}
            onCheckedChange={() => toggleValue(opt.value)}
          >
            {opt.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function filterTriggerClassName(active: boolean): string {
  return cn(
    "flex h-6 max-w-44 items-center gap-1.5 rounded border border-input bg-background px-1.5 text-[11px] transition-colors outline-none select-none",
    "hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    active ? "text-foreground" : "text-muted-foreground",
  );
}

function normalizeFilterValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item))
      .filter((item) => item.length > 0);
  }
  if (value == null || value === "") return [];
  return [String(value)];
}

// ── Helpers ──

/** Coerce a string edit value back to a typed JS value. */
function tryParseEditValue(raw: string): unknown {
  if (raw === "" || raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim() !== "") return num;
  return raw;
}
