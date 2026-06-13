import type { RowData } from "@tanstack/react-table";

// ---------------------------------------------------------------------------
// ColumnMeta augmentation — extends the existing `grow` flag with `editable`.
// This merges with the declaration in data-table.ts (TanStack allows multiple
// module augmentations as long as the interfaces merge cleanly).
// ---------------------------------------------------------------------------
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    grow?: boolean;
    editable?: EditableConfig<TData>;
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Async save callback — the consumer wraps their mutation call in this. */
export type SaveFn<TData, V> = (row: TData, value: V) => Promise<void> | void;

/** Option for select-type editors. */
export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Discriminated union of editor configurations. Each variant specifies:
 * - `getValue`: extracts the editable value from the row data
 * - `save`: persists the new value (consumer provides mutation logic)
 * - variant-specific options (min/max, options list, etc.)
 */
export type EditableConfig<TData> =
  | {
      type: "text";
      getValue: (row: TData) => string;
      save: SaveFn<TData, string>;
    }
  | {
      type: "number";
      getValue: (row: TData) => number;
      save: SaveFn<TData, number>;
      min?: number;
      max?: number;
      step?: number;
    }
  | {
      type: "select";
      getValue: (row: TData) => string;
      save: SaveFn<TData, string>;
      options: SelectOption[];
    }
  | {
      type: "boolean";
      getValue: (row: TData) => boolean;
      save: SaveFn<TData, boolean>;
    }
  | {
      type: "date";
      getValue: (row: TData) => string | null;
      save: SaveFn<TData, string | null>;
    };

// ---------------------------------------------------------------------------
// Editor component props — shared across all editor types
// ---------------------------------------------------------------------------

export interface CellEditorProps<T> {
  /** Current draft value. */
  value: T;
  /** Update the draft (does NOT trigger save). */
  onChange: (value: T) => void;
  /** Persist the current draft value. */
  onSave: () => void;
  /** Abort editing and revert to original value. */
  onCancel: () => void;
}
