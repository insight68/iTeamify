"use client";

import * as React from "react";
import type {
  CellContext,
  ColumnDef,
} from "@tanstack/react-table";
import type { EditableConfig } from "@teamify/ui/lib/editable-data-table";
import { DataTable } from "@teamify/ui/components/ui/data-table";
import { EditableCell } from "@teamify/ui/components/ui/editable-cell";

// ---------------------------------------------------------------------------
// EditingCellContext — coordinates "one cell editable at a time"
// ---------------------------------------------------------------------------

export interface EditingCellContextValue {
  /** "${rowId}:${columnId}" of the cell currently being edited, or null. */
  editingCellId: string | null;
  setEditingCellId: (id: string | null) => void;
}

export const EditingCellContext = React.createContext<EditingCellContextValue>({
  editingCellId: null,
  setEditingCellId: () => {},
});

// ---------------------------------------------------------------------------
// withEditableCells — column-definition transformer
// ---------------------------------------------------------------------------

/**
 * Wraps column cell renderers with `EditableCell` for any column that has
 * `meta.editable` configured. Columns without `meta.editable` pass through
 * unchanged (same object identity).
 */
export function withEditableCells<TData>(
  columns: ColumnDef<TData>[],
): ColumnDef<TData>[] {
  return columns.map((col) => {
    const editable = col.meta?.editable as
      | EditableConfig<TData>
      | undefined;
    if (!editable) return col;

    const originalCell = col.cell;

    return {
      ...col,
      cell: (ctx: CellContext<TData, unknown>) => {
        // Render the original cell content eagerly and pass the result.
        // This avoids the thunk indirection — EditableCell receives a
        // ReactNode directly for display mode.
        const rendered =
          originalCell != null
            ? typeof originalCell === "function"
              ? (originalCell as (ctx: CellContext<TData, unknown>) => React.ReactNode)(ctx)
              : (originalCell as React.ReactNode)
            : undefined;

        return (
          <EditableCell
            cellContext={ctx}
            config={editable}
            originalCell={rendered}
          />
        );
      },
    };
  });
}

// ---------------------------------------------------------------------------
// EditableDataTable — drop-in replacement for DataTable with editing support
// ---------------------------------------------------------------------------

export interface EditableDataTableProps<TData>
  extends React.ComponentProps<typeof DataTable<TData>> {}

/**
 * Drop-in replacement for `DataTable` that adds inline cell editing support.
 *
 * Wrap your columns with `withEditableCells()` and use this component instead
 * of `<DataTable>`:
 *
 * ```tsx
 * const columns = useMemo(() => withEditableCells(rawColumns), [rawColumns]);
 * const table = useReactTable({ data, columns, getCoreRowModel });
 * return <EditableDataTable table={table} />;
 * ```
 */
export function EditableDataTable<TData>(
  props: EditableDataTableProps<TData>,
) {
  const [editingCellId, setEditingCellId] = React.useState<string | null>(
    null,
  );

  const contextValue = React.useMemo(
    () => ({ editingCellId, setEditingCellId }),
    [editingCellId],
  );

  return (
    <EditingCellContext.Provider value={contextValue}>
      <DataTable {...props} />
    </EditingCellContext.Provider>
  );
}
