"use client";

import { Input } from "@teamify/ui/components/ui/input";
import type { CellEditorProps } from "@teamify/ui/lib/editable-data-table";
import { useInlineInputEditor } from "@teamify/ui/hooks/use-inline-input-editor";

export interface NumberCellEditorProps extends CellEditorProps<number> {
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Inline number editor — auto-focuses, Enter saves, Escape cancels,
 * blur saves unless Escape was pressed.
 */
export function NumberCellEditor({
  value,
  onChange,
  onSave,
  onCancel,
  min,
  max,
  step = 1,
}: NumberCellEditorProps) {
  const { ref, handleKeyDown, handleBlur } = useInlineInputEditor({
    onSave,
    onCancel,
  });

  return (
    <Input
      ref={ref}
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      min={min}
      max={max}
      step={step}
      className="h-6 rounded-sm border-ring px-1.5 py-0 text-sm shadow-none focus-visible:ring-1"
    />
  );
}
