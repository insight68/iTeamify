"use client";

import { Input } from "@teamify/ui/components/ui/input";
import type { CellEditorProps } from "@teamify/ui/lib/editable-data-table";
import { useInlineInputEditor } from "@teamify/ui/hooks/use-inline-input-editor";

/**
 * Inline text editor — auto-focuses, Enter saves, Escape cancels,
 * blur saves unless Escape was pressed.
 */
export function TextCellEditor({
  value,
  onChange,
  onSave,
  onCancel,
}: CellEditorProps<string>) {
  const { ref, handleKeyDown, handleBlur } = useInlineInputEditor({
    onSave,
    onCancel,
  });

  return (
    <Input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className="h-6 rounded-sm border-ring px-1.5 py-0 text-sm shadow-none focus-visible:ring-1"
    />
  );
}
