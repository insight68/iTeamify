"use client";

import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@teamify/ui/components/ui/popover";
import type { CellEditorProps, SelectOption } from "@teamify/ui/lib/editable-data-table";
import { usePopoverEditor } from "@teamify/ui/hooks/use-popover-editor";

export interface SelectCellEditorProps extends CellEditorProps<string> {
  options: SelectOption[];
}

const triggerClassName =
  "inline-flex h-6 w-full items-center rounded-sm border border-ring px-1.5 text-sm outline-none focus-visible:ring-1";

/**
 * Select editor — Popover with scrollable option list. Clicking an
 * option triggers save immediately. Escape or clicking outside cancels.
 */
export function SelectCellEditor({
  value,
  onChange,
  onSave,
  onCancel,
  options,
}: SelectCellEditorProps) {
  const { open, handleOpenChange, handleKeyDown } = usePopoverEditor({
    onCancel,
  });

  const handleSelect = React.useCallback(
    (option: SelectOption) => {
      onChange(option.value);
      onSave();
      // No rAF needed — onSave in EditableCell accepts the draft
      // value which onChange has already set via setState batching.
    },
    [onChange, onSave],
  );

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? value;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <span className={triggerClassName} onKeyDown={handleKeyDown}>
            {selectedLabel}
          </span>
        }
      />
      <PopoverContent
        className="w-[var(--trigger-width)] p-1"
        align="start"
        sideOffset={2}
      >
        <div className="max-h-48 overflow-y-auto">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`w-full rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent ${
                option.value === value ? "bg-accent font-medium" : ""
              }`}
              onClick={() => handleSelect(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
