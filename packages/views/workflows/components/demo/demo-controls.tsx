"use client"

import { Button } from "@teamify/ui/components/ui/button"
import { ArrowRight, Play } from "lucide-react"

interface DemoControlsProps {
  currentIndex: number
  totalStages: number
  onPrev: () => void
  onNext: () => void
  onAutoPlay: () => void
  prevLabel: string
  nextLabel: string
  autoPlayLabel: string
}

export function DemoControls({
  currentIndex,
  totalStages,
  onPrev,
  onNext,
  onAutoPlay,
  prevLabel,
  nextLabel,
  autoPlayLabel,
}: DemoControlsProps) {
  const isFirst = currentIndex === 0
  const isLast = currentIndex === totalStages - 1

  return (
    <div className="flex items-center justify-between">
      <Button
        variant="ghost"
        size="sm"
        onClick={onPrev}
        disabled={isFirst}
      >
        <ArrowRight className="size-3 rotate-180" />
        <span className="ml-1.5">{prevLabel}</span>
      </Button>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onAutoPlay}>
          <Play className="size-3" />
          <span className="ml-1.5 hidden sm:inline">{autoPlayLabel}</span>
        </Button>
        <span className="text-xs text-muted-foreground">
          {currentIndex + 1} / {totalStages}
        </span>
      </div>

      <Button
        variant={isLast ? "default" : "ghost"}
        size="sm"
        onClick={onNext}
        disabled={isLast}
      >
        <span className="mr-1.5">{nextLabel}</span>
        <ArrowRight className="size-3" />
      </Button>
    </div>
  )
}
