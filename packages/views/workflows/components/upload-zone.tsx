"use client"

import { useRef, useState, useCallback } from "react"
import { Upload, FileSpreadsheet } from "lucide-react"
import { cn } from "@teamify/ui/lib/utils"
import { useT } from "../../i18n"

interface UploadZoneProps {
  onUpload: (file: File) => Promise<void>
  uploading: boolean
}

export function UploadZone({ onUpload, uploading }: UploadZoneProps) {
  const { t } = useT("workflows")
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(xlsx?|xls)$/i)) return
      await onUpload(file)
    },
    [onUpload],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      e.target.value = ""
      handleFile(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors",
        dragOver
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/30 hover:bg-muted/30",
        uploading && "pointer-events-none opacity-50",
      )}
    >
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">{t(($) => $.upload.parsing)}</p>
        </div>
      ) : dragOver ? (
        <>
          <Upload className="size-10 text-primary" />
          <p className="text-sm font-medium text-primary">{t(($) => $.upload.dropHere)}</p>
        </>
      ) : (
        <>
          <FileSpreadsheet className="size-10 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium">{t(($) => $.upload.title)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(($) => $.upload.hint)}
            </p>
          </div>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleChange}
        disabled={uploading}
      />
    </div>
  )
}
