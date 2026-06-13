"use client";

import * as React from "react";

/**
 * Shared hook for popover-based editors (select, date).
 *
 * Encapsulates: auto-open on mount, close-without-selection → cancel,
 * Escape → close + cancel.
 */
export function usePopoverEditor({
  onCancel,
}: {
  onCancel: () => void;
}) {
  const [open, setOpen] = React.useState(true);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        onCancel();
      }
    },
    [onCancel],
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        onCancel();
      }
    },
    [onCancel],
  );

  return { open, setOpen, handleOpenChange, handleKeyDown };
}
