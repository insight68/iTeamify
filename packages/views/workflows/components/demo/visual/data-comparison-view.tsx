"use client"

import { CheckCircle2, AlertTriangle, TrendingDown, BarChart3 } from "lucide-react"

interface ComparisonRow {
  [key: string]: { value: string; status?: "best" | "warning" | "normal" }
}

interface ComparisonColumn {
  key: string
  label: string
}

interface DataComparisonViewProps {
  data: Record<string, unknown>
}

const statusCellClass: Record<string, string> = {
  best: "text-green-600 dark:text-green-400 font-medium",
  warning: "text-amber-600 dark:text-amber-400 font-medium",
  normal: "",
}

export function DataComparisonView({ data }: DataComparisonViewProps) {
  const title = (data.title as string) ?? ""
  const columns = (data.columns as ComparisonColumn[]) ?? []
  const rows = (data.rows as ComparisonRow[]) ?? []
  const summary = (data.summary as Array<{ label: string; value: string }>) ?? []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="size-4 text-purple-500" />
        <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
          {title}
        </span>
      </div>

      {/* Summary bar */}
      {summary.length > 0 && (
        <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-muted/30 p-3">
          {summary.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{s.label}:</span>
              <span className="font-semibold">{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Data table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-border last:border-b-0 transition-colors hover:bg-muted/20 animate-demo-fade-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {columns.map((col) => {
                  const cell = row[col.key]
                  if (!cell) return <td key={col.key} className="px-4 py-3">—</td>

                  const cls = cell.status ? statusCellClass[cell.status] ?? "" : ""
                  const isBest = cell.status === "best"
                  const isWarning = cell.status === "warning"

                  return (
                    <td key={col.key} className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 ${cls}`}>
                        {isBest && (
                          <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />
                        )}
                        {isWarning && (
                          <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                        )}
                        {cell.value}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="size-3 text-green-500" />
          最优
        </span>
        <span className="inline-flex items-center gap-1">
          <AlertTriangle className="size-3 text-amber-500" />
          预警
        </span>
        <span className="inline-flex items-center gap-1">
          <TrendingDown className="size-3" />
          正常
        </span>
      </div>
    </div>
  )
}
