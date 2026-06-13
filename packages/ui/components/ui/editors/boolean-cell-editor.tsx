"use client";

import * as React from "react";
import { Switch } from "@teamify/ui/components/ui/switch";
import type { CellEditorProps } from "@teamify/ui/lib/editable-data-table";

/**
 * Boolean editor — Switch that saves immediately on toggle.
 * No "edit mode" transition; the toggle IS the edit gesture.
 * The parent's optimistic mutation handles cache rollback on failure,
 * so the switch re-renders to its old position automatically.
 */
export function BooleanCellEditor({
  value,
  onSave,
}: CellEditorProps<boolean>) {
  const handleCheckedChange = React.useCallback(
    async (_checked: boolean) => {
      try {
        await onSave();
      } catch {
        // Mutation's onError handles cache rollback → switch re-renders
      }
    },
    [onSave],
  );

  return (
    <div className="flex items-center">
      <Switch
        checked={value}
        onCheckedChange={handleCheckedChange}
        size="sm"
      />
    </div>
  );
}
