"use client"

import { Card, CardContent } from "@teamify/ui/components/ui/card"
import { FileText, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react"

interface ReportSection {
  heading: string
  content: string
  metrics?: Array<{
    label: string
    value: string
    trend?: "up" | "down"
  }>
}

interface ReportViewProps {
  data: Record<string, unknown>
}

export function ReportView({ data }: ReportViewProps) {
  const title = (data.title as string) ?? ""
  const sections = (data.sections as ReportSection[]) ?? []
  const riskFlags = (data.riskFlags as string[]) ?? []

  return (
    <div className="space-y-4">
      {/* Report header */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
          <FileText className="size-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">AI 自动生成 · 实时更新</p>
        </div>
      </div>

      {/* Report sections */}
      <div className="space-y-4">
        {sections.map((section, i) => (
          <Card
            key={i}
            size="sm"
            className="animate-demo-fade-up"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold">{section.heading}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {section.content}
              </p>

              {/* Metrics row */}
              {section.metrics && section.metrics.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {section.metrics.map((m, j) => (
                    <div
                      key={j}
                      className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2"
                    >
                      <span className="text-xs text-muted-foreground">{m.label}</span>
                      <span className="text-sm font-semibold">{m.value}</span>
                      {m.trend === "up" && (
                        <TrendingUp className="size-3 text-green-500" />
                      )}
                      {m.trend === "down" && (
                        <TrendingDown className="size-3 text-red-500" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Risk flags */}
      {riskFlags.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-50/40 p-4 dark:bg-amber-950/10">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-4 text-amber-500" />
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              风险标注
            </p>
          </div>
          <ul className="space-y-1">
            {riskFlags.map((flag, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <span className="size-1 rounded-full bg-amber-500" />
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
