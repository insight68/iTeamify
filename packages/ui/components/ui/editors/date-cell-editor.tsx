"use client";

import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@teamify/ui/components/ui/popover";
import { Calendar } from "@teamify/ui/components/ui/calendar";
import type { CellEditorProps } from "@teamify/ui/lib/editable-data-table";
import { usePopoverEditor } from "@teamify/ui/hooks/use-popover-editor";

const triggerClassName =
  "inline-flex h-6 w-full items-center rounded-sm border border-ring px-1.5 text-sm outline-none focus-visible:ring-1";

/**
 * Date editor — Popover with Calendar. Selecting a date calls onChange
 * with the ISO string, then onSave. Escape or clicking outside cancels.
 */
export function DateCellEditor({
  value,
  onChange,
  onSave,
  onCancel,
}: CellEditorProps<string | null>) {
  const { open, handleOpenChange, handleKeyDown } = usePopoverEditor({
    onCancel,
  });

  const selectedDate = value ? new Date(value) : undefined;

  const handleSelect = React.useCallback(
    (date: Date | undefined) => {
      if (date) {
        const iso = date.toISOString().slice(0, 10);
        onChange(iso);
        onSave();
      }
    },
    [onChange, onSave],
  );

  const displayValue = value ?? "Pick a date";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <span className={triggerClassName} onKeyDown={handleKeyDown}>
            {displayValue}
          </span>
        }
      />
      <PopoverContent className="w-auto p-0" align="start" sideOffset={2}>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
