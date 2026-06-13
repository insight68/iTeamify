"use client";

import * as React from "react";

/**
 * Shared hook for inline input-based editors (text, number).
 *
 * Encapsulates: auto-focus + select-all on mount, Enter→save,
 * Escape→cancel, and the isEscaping ref guard to prevent blur
 * from re-saving after pressing Escape.
 */
export function useInlineInputEditor({
  onSave,
  onCancel,
}: {
  onSave: () => void;
  onCancel: () => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);

  // Auto-focus + select-all on mount
  React.useEffect(() => {
    const el = ref.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  // Guard: pressing Escape sets this flag so the subsequent blur
  // handler knows not to save.
  const isEscaping = React.useRef(false);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        isEscaping.current = true;
        onCancel();
      }
    },
    [onSave, onCancel],
  );

  const handleBlur = React.useCallback(() => {
    if (isEscaping.current) {
      isEscaping.current = false;
      return;
    }
    onSave();
  }, [onSave]);

  return { ref, handleKeyDown, handleBlur };
}
