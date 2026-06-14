"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@teamify/ui/components/ui/card"
import { Badge } from "@teamify/ui/components/ui/badge"
import { Button } from "@teamify/ui/components/ui/button"
import {
  Bot,
  X,
  Zap,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"
import { useT } from "../../../i18n"
import type { DemoStage } from "../../lib/types"
import { DemoProgressBar } from "./demo-progress-bar"
import { DemoControls } from "./demo-controls"
import { DemoStageRenderer } from "./demo-stage-renderer"

interface StepDemoViewerProps {
  stages: DemoStage[]
  onClose: () => void
}

export function StepDemoViewer({ stages, onClose }: StepDemoViewerProps) {
  const { t } = useT("workflows")
  const [currentIndex, setCurrentIndex] = useState(0)
  const currentStage = stages[currentIndex] as DemoStage | undefined

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, stages.length - 1))
  }, [stages.length])

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0))
  }, [])

  const handleAutoPlay = useCallback(() => {
    if (currentIndex < stages.length - 1) {
      goNext()
    }
  }, [currentIndex, stages.length, goNext])

  // Reset when stages change (step switch)
  useEffect(() => {
    setCurrentIndex(0)
  }, [stages])

  if (!currentStage) return null

  return (
    <div className="space-y-6 animate-demo-fade-up duration-300">
      {/* Demo header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/30">
            <Bot className="size-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-heading font-semibold">
                AI 数字员工演示
              </p>
              <Badge className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                实时模拟
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              分步展示 AI 在本环节的处理过程
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Progress bar */}
      <DemoProgressBar
        stages={stages}
        currentIndex={currentIndex}
        onSelect={(i) => {
          if (i <= currentIndex) setCurrentIndex(i)
        }}
      />

      {/* Current stage */}
      <Card className="border-purple-500/20 overflow-hidden">
        {/* Stage title bar */}
        <div className="flex items-center gap-3 border-b border-purple-500/10 bg-purple-50/40 dark:bg-purple-950/10 px-5 py-4">
          <Zap className="size-4 text-purple-500" />
          <div>
            <p className="text-sm font-semibold text-purple-800 dark:text-purple-300">
              {currentStage.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {currentStage.description}
            </p>
          </div>
        </div>

        {/* Visual content */}
        <CardContent className="p-5">
          <DemoStageRenderer
            visualType={currentStage.visualType}
            visualData={currentStage.visualData}
          />
        </CardContent>
      </Card>

      {/* Result summary */}
      {currentStage.result && (
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="size-4 text-green-500" />
              <span className="text-sm font-medium">
                {t(($) => $.demo.processingComplete)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {currentStage.result.summary}
            </p>

            {/* Highlight chips */}
            {currentStage.result.highlights &&
              currentStage.result.highlights.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentStage.result.highlights.map((h, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="text-xs text-green-700 dark:text-green-300 border-green-500/20"
                    >
                      {h}
                    </Badge>
                  ))}
                </div>
              )}

            {/* Warning chips */}
            {currentStage.result.warnings &&
              currentStage.result.warnings.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {currentStage.result.warnings.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400"
                    >
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                      {w}
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <DemoControls
        currentIndex={currentIndex}
        totalStages={stages.length}
        onPrev={goPrev}
        onNext={goNext}
        onAutoPlay={handleAutoPlay}
        prevLabel={t(($) => $.demo.prevStage)}
        nextLabel={t(($) => $.demo.nextStage)}
        autoPlayLabel={t(($) => $.demo.autoPlay)}
      />
    </div>
  )
}
