"use client"

import { CheckCircle2, Circle } from "lucide-react"
import type { DemoStage } from "../../lib/types"

interface DemoProgressBarProps {
  stages: DemoStage[]
  currentIndex: number
  onSelect: (index: number) => void
}

export function DemoProgressBar({
  stages,
  currentIndex,
  onSelect,
}: DemoProgressBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {stages.map((stage, i) => {
        const isCompleted = i < currentIndex
        const isCurrent = i === currentIndex
        const isFuture = i > currentIndex

        return (
          <button
            key={stage.id}
            type="button"
            onClick={() => onSelect(i)}
            disabled={isFuture && !isCompleted}
            className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
              isCurrent
                ? "border-purple-500/50 bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-300"
                : isCompleted
                  ? "border-green-500/30 bg-green-50 text-green-700 dark:bg-green-950/10 dark:text-green-300 cursor-pointer hover:ring-1 hover:ring-green-500/30"
                  : "border-border bg-muted/30 text-muted-foreground cursor-not-allowed opacity-50"
            }`}
          >
            {isCompleted ? (
              <CheckCircle2 className="size-3.5 text-green-500" />
            ) : (
              <Circle
                className={`size-3.5 ${
                  isCurrent ? "text-purple-500" : "text-muted-foreground/40"
                }`}
              />
            )}
            <span className="max-w-[120px] truncate hidden sm:inline">
              {stage.title}
            </span>
            <span className="sm:hidden">{i + 1}</span>
          </button>
        )
      })}
    </div>
  )
}
