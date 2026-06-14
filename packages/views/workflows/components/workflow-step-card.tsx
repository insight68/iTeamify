"use client"

import { useState } from "react"
import { ChevronDown, User, Bot } from "lucide-react"
import { cn } from "@teamify/ui/lib/utils"
import { Badge } from "@teamify/ui/components/ui/badge"
import type { WorkflowStep } from "../lib/types"

interface WorkflowStepCardProps {
  step: WorkflowStep
  isLast: boolean
  isActive: boolean
  onActivate: () => void
}

export function WorkflowStepCard({
  step,
  isLast,
  isActive,
  onActivate,
}: WorkflowStepCardProps) {
  const [expanded, setExpanded] = useState(isActive)

  const handleToggle = () => {
    setExpanded(!expanded)
    onActivate()
  }

  const renderTasks = (text: string) => {
    return text.split("\n").map((line, i) => {
      const trimmed = line.replace(/^\d+\.\s*/, "").trim()
      if (!trimmed) return null
      return (
        <li key={i} className="text-sm leading-relaxed">
          {trimmed}
        </li>
      )
    })
  }

  return (
    <div className="flex gap-4">
      {/* Timeline indicator */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
            isActive
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/30 bg-card text-muted-foreground hover:border-primary/50",
          )}
        >
          {step.order}
        </button>
        {!isLast && (
          <div className="w-px flex-1 bg-border" />
        )}
      </div>

      {/* Card content */}
      <div
        className={cn(
          "flex-1 pb-6 transition-opacity",
          !isActive && !expanded && "opacity-60",
        )}
      >
        <button
          type="button"
          onClick={handleToggle}
          className="group mb-3 flex w-full items-center gap-2 text-left"
        >
          <h3 className="text-base font-medium group-hover:text-primary transition-colors">
            {step.name}
          </h3>
          {step.department && (
            <Badge variant="secondary" className="text-[10px]">
              {step.department}
            </Badge>
          )}
          <ChevronDown
            className={cn(
              "ml-auto size-4 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>

        {expanded && (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Traditional side */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <User className="size-3" />
                传统工作事项
              </div>
              <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                {renderTasks(step.traditionalTasks)}
              </ul>
            </div>

            {/* AI side */}
            <div className="rounded-lg border border-purple-500/30 bg-purple-50/50 p-4 dark:bg-purple-950/20">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-purple-600 dark:text-purple-400">
                <Bot className="size-3" />
                AI 数字员工执行事项
              </div>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {renderTasks(step.aiTasks)}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
