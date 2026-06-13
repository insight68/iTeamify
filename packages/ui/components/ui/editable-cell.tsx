"use client";

import * as React from "react";
import type { CellContext } from "@tanstack/react-table";
import type { EditableConfig } from "@teamify/ui/lib/editable-data-table";
import { EditingCellContext } from "./editable-data-table";
import { TextCellEditor } from "./editors/text-cell-editor";
import { NumberCellEditor } from "./editors/number-cell-editor";
import { SelectCellEditor } from "./editors/select-cell-editor";
import { BooleanCellEditor } from "./editors/boolean-cell-editor";
import { DateCellEditor } from "./editors/date-cell-editor";

interface EditableCellProps<TData> {
  cellContext: CellContext<TData, unknown>;
  config: EditableConfig<TData>;
  /** Pre-rendered original cell content for display mode. */
  originalCell?: React.ReactNode;
}

/**
 * A single editable cell that manages its own read/edit lifecycle.
 *
 * - Display mode: renders original cell content + double-click handler
 * - Edit mode: renders the appropriate editor (text, number, select, date)
 * - Boolean: renders a Switch directly (no edit mode)
 * - Tracks error state for inline feedback
 */
export function EditableCell<TData>({
  cellContext,
  config,
  originalCell,
}: EditableCellProps<TData>) {
  const { editingCellId, setEditingCellId } = React.useContext(EditingCellContext);

  const row = cellContext.row;
  const columnId = cellContext.column.id;
  const cellId = `${row.id}:${columnId}`;
  const isEditing = editingCellId === cellId;

  const originalValue = config.getValue(row.original);
  const [draftValue, setDraftValue] = React.useState(originalValue);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Refs for mutable data — avoids re-creating callbacks on every query refresh
  const originalValueRef = React.useRef(originalValue);
  originalValueRef.current = originalValue;

  const rowRef = React.useRef(row.original);
  rowRef.current = row.original;

  const configRef = React.useRef(config);
  configRef.current = config;

  // Sync draft when original value changes (e.g., from optimistic update)
  React.useEffect(() => {
    if (!isEditing) {
      setDraftValue(originalValue);
    }
  }, [originalValue, isEditing]);

  // --- Shared save handler (used by all non-boolean editors) ---
  const handleSave = React.useCallback(async () => {
    // Compare against latest original value via ref (not stale closure)
    if (draftValue === originalValueRef.current) {
      setEditingCellId(null);
      setErrorMessage(null);
      return;
    }

    setErrorMessage(null);

    try {
      await configRef.current.save(rowRef.current, draftValue as never);
      setEditingCellId(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to save. Press Esc to cancel.",
      );
    }
  }, [draftValue, setEditingCellId]);

  const handleCancel = React.useCallback(() => {
    setDraftValue(originalValueRef.current);
    setEditingCellId(null);
    setErrorMessage(null);
  }, [setEditingCellId]);

  // --- Boolean: immediate toggle, no edit mode ---
  if (config.type === "boolean") {
    const handleBooleanSave = React.useCallback(async () => {
      try {
        await configRef.current.save(
          rowRef.current,
          !originalValueRef.current as unknown as never,
        );
      } catch {
        // Mutation's onError handles cache rollback → switch re-renders
      }
    }, []);

    return (
      <BooleanCellEditor
        value={!!originalValue}
        onChange={() => {}}
        onSave={handleBooleanSave}
        onCancel={() => {}}
      />
    );
  }

  // --- Enter edit mode on double-click ---
  const handleDoubleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setDraftValue(originalValueRef.current);
      setErrorMessage(null);
      setEditingCellId(cellId);
    },
    [cellId, setEditingCellId],
  );

  // --- Display mode ---
  if (!isEditing) {
    return (
      <div
        className="flex h-full min-h-6 w-full cursor-text items-center rounded-sm transition-colors hover:bg-muted/50"
        onDoubleClick={handleDoubleClick}
      >
        {originalCell ?? String(originalValue ?? "")}
      </div>
    );
  }

  // --- Edit mode — render the appropriate editor ---
  return (
    <div className="flex flex-col gap-0.5">
      {config.type === "text" && (
        <TextCellEditor
          value={draftValue as string}
          onChange={(v) => setDraftValue(v)}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
      {config.type === "number" && (
        <NumberCellEditor
          value={draftValue as number}
          onChange={(v) => setDraftValue(v)}
          onSave={handleSave}
          onCancel={handleCancel}
          min={config.min}
          max={config.max}
          step={config.step}
        />
      )}
      {config.type === "select" && (
        <SelectCellEditor
          value={draftValue as string}
          onChange={(v) => setDraftValue(v)}
          onSave={handleSave}
          onCancel={handleCancel}
          options={config.options}
        />
      )}
      {config.type === "date" && (
        <DateCellEditor
          value={draftValue as string | null}
          onChange={(v) => setDraftValue(v)}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
      {errorMessage && (
        <span className="text-[10px] text-destructive">{errorMessage}</span>
      )}
    </div>
  );
}
