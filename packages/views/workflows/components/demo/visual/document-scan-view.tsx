"use client"

import { Card, CardContent } from "@teamify/ui/components/ui/card"
import { Badge } from "@teamify/ui/components/ui/badge"
import { FileText, ScanLine, CheckCircle2, AlertTriangle, Info } from "lucide-react"

interface ExtractedField {
  label: string
  value: string
  confidence: number
  highlighted?: boolean
}

interface Annotation {
  text: string
  type: "info" | "warning" | "success"
}

interface DocumentScanViewProps {
  data: Record<string, unknown>
}

const annotationConfig = {
  info: {
    icon: <Info className="size-3.5" />,
    bgClass: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800",
    textClass: "text-blue-700 dark:text-blue-300",
  },
  warning: {
    icon: <AlertTriangle className="size-3.5" />,
    bgClass: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800",
    textClass: "text-amber-700 dark:text-amber-300",
  },
  success: {
    icon: <CheckCircle2 className="size-3.5" />,
    bgClass: "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800",
    textClass: "text-green-700 dark:text-green-300",
  },
}

export function DocumentScanView({ data }: DocumentScanViewProps) {
  const documentTitle = (data.documentTitle as string) ?? ""
  const documentType = (data.documentType as string) ?? "document"
  const fields = (data.extractedFields as ExtractedField[]) ?? []
  const annotations = (data.annotations as Annotation[]) ?? []

  return (
    <div className="space-y-4">
      {/* Simulated document header */}
      <Card className="overflow-hidden border-border">
        {/* Document title bar with scan animation */}
        <div className="relative flex items-center gap-3 border-b border-border bg-muted/30 px-5 py-3">
          <FileText className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{documentTitle}</p>
            <p className="text-xs text-muted-foreground capitalize">{documentType}</p>
          </div>
          {/* Scan line animation */}
          <div className="absolute left-0 top-0 h-0.5 w-full animate-pulse bg-purple-500/60" />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute left-0 h-8 w-full bg-gradient-to-r from-purple-500/0 via-purple-500/10 to-purple-500/0 animate-demo-scan-line pointer-events-none" />
          </div>
        </div>

        {/* Extracted fields */}
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <ScanLine className="size-4 text-purple-500" />
            <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
              OCR 识别字段
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {fields.map((field, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-md border px-3 py-2.5 transition-all animate-demo-fade-up ${
                  field.highlighted
                    ? "border-purple-500/30 bg-purple-50/50 dark:bg-purple-950/10"
                    : "border-transparent bg-muted/30"
                }`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className="shrink-0 text-xs text-muted-foreground min-w-[72px]">
                  {field.label}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium truncate">
                  {field.value}
                </span>
                <Badge
                  variant="secondary"
                  className={`shrink-0 text-[10px] ${
                    field.confidence >= 95
                      ? "text-green-600"
                      : field.confidence >= 85
                        ? "text-amber-600"
                        : "text-red-600"
                  }`}
                >
                  {field.confidence}%
                </Badge>
              </div>
            ))}
          </div>

          {/* Annotations */}
          {annotations.length > 0 && (
            <div className="mt-4 space-y-2">
              {annotations.map((a, i) => {
                const annType = (a.type as keyof typeof annotationConfig) || "info"
                const cfg = annotationConfig[annType] || annotationConfig.info
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${cfg.bgClass} ${cfg.textClass}`}
                  >
                    {cfg.icon}
                    {a.text}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
