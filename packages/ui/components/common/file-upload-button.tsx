"use client";

import { useRef } from "react";
import { Paperclip } from "lucide-react";
import { cn } from "@teamify/ui/lib/utils";

interface FileUploadButtonProps {
  /** Called with the selected File — caller handles upload. */
  onSelect: (file: File) => void;
  /** Called with all selected files. When omitted, only the first file is passed to onSelect. */
  onSelectFiles?: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default";
  label?: string;
}

function FileUploadButton({
  onSelect,
  onSelectFiles,
  multiple = false,
  disabled,
  className,
  size = "default",
  label = "Attach file",
}: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = "";
    if (onSelectFiles) {
      onSelectFiles(files);
      return;
    }
    const first = files[0];
    if (first) onSelect(first);
  };

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const btnSize = size === "sm" ? "h-6 w-6" : "h-7 w-7";

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none",
          btnSize,
          className,
        )}
      >
        <Paperclip className={iconSize} />
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        className="hidden"
        onChange={handleChange}
      />
    </>
  );
}

export { FileUploadButton, type FileUploadButtonProps };
