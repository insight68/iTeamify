"use client"

import { User, Bot, ChevronRight, CheckCircle2, AlertTriangle, Zap, ArrowRight } from "lucide-react"
import { Badge } from "@teamify/ui/components/ui/badge"
import { Card, CardContent } from "@teamify/ui/components/ui/card"
import { Button } from "@teamify/ui/components/ui/button"
import { useT } from "../../i18n"
import { useNavigation } from "../../navigation"
import type { Workflow, WorkflowStep } from "../lib/types"

interface StepDetailContentProps {
  workflow: Workflow
  step: WorkflowStep | undefined
}

export function StepDetailContent({ workflow, step }: StepDetailContentProps) {
  const { t } = useT("workflows")
  const navigation = useNavigation()

  // Overview mode: no step selected
  if (!step) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-heading font-semibold">{workflow.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {workflow.sourceFileName} · {workflow.steps.length} {t(($) => $.common.steps)}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {workflow.steps.map((s) => (
            <Card
              key={s.id}
              size="sm"
              className="cursor-pointer transition-shadow hover:ring-1 hover:ring-primary/30"
              onClick={() =>
                navigation.replace(`/workflows/${workflow.id}?step=${s.id}`)
              }
            >
              <CardContent className="flex items-start gap-3 p-4">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-bold text-muted-foreground">
                  {s.order}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.name}</p>
                  {s.department && (
                    <Badge variant="secondary" className="mt-1 text-[10px]">
                      {s.department}
                    </Badge>
                  )}
                </div>
                <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const currentIndex = workflow.steps.findIndex((s) => s.id === step.id)
  const prevStep = currentIndex > 0 ? workflow.steps[currentIndex - 1] : null
  const nextStep = currentIndex < workflow.steps.length - 1 ? workflow.steps[currentIndex + 1] : null

  const renderTaskList = (text: string, icon: React.ReactNode) => {
    const lines = text.split("\n").filter(Boolean)
    if (lines.length === 0) {
      return (
        <p className="text-sm text-muted-foreground italic">{t(($) => $.detail.noData)}</p>
      )
    }
    return (
      <ul className="space-y-3">
        {lines.map((line, i) => {
          const trimmed = line.replace(/^\d+\.\s*/, "").trim()
          if (!trimmed) return null
          return (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 shrink-0">{icon}</span>
              <span className="text-sm leading-relaxed">{trimmed}</span>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      {/* Step header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t(($) => $.detail.totalSteps)} {step.order}/{workflow.steps.length}</span>
          {step.department && (
            <>
              <span aria-hidden="true">·</span>
              <Badge variant="secondary" className="text-[10px]">
                {step.department}
              </Badge>
            </>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-heading font-semibold">{step.name}</h1>
      </div>

      {/* Comparison cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Traditional side */}
        <Card className="border-border bg-muted/20">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <User className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">{t(($) => $.detail.traditionalTitle)}</p>
                <p className="text-xs text-muted-foreground">{t(($) => $.detail.traditionalSub)}</p>
              </div>
            </div>
            {renderTaskList(
              step.traditionalTasks,
              <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />,
            )}
          </CardContent>
        </Card>

        {/* AI side */}
        <Card className="border-purple-500/30 bg-purple-50/40 dark:bg-purple-950/10">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Bot className="size-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-purple-800 dark:text-purple-300">
                  {t(($) => $.detail.aiTitle)}
                </p>
                <p className="text-xs text-purple-600/70 dark:text-purple-400/70">
                  {t(($) => $.detail.aiSub)}
                </p>
              </div>
            </div>
            {renderTaskList(
              step.aiTasks,
              <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />,
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI highlights */}
      {step.aiTasks && (
        <div className="mt-6 rounded-lg border border-purple-500/20 bg-purple-50/20 p-4 dark:bg-purple-950/5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="size-4 text-purple-500" />
            <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
              {t(($) => $.detail.aiHighlights)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {step.aiTasks.split("\n").filter(Boolean).map((task, i) => {
              const trimmed = task.replace(/^\d+\.\s*/, "").trim()
              if (!trimmed) return null
              return (
                <Badge
                  key={i}
                  variant="outline"
                  className="border-purple-500/30 text-purple-700 dark:text-purple-300 text-xs"
                >
                  {trimmed.length > 50 ? trimmed.slice(0, 50) + "..." : trimmed}
                </Badge>
              )
            })}
          </div>
        </div>
      )}

      {/* Step navigation */}
      <div className="mt-8 flex items-center justify-between border-t pt-6">
        {prevStep ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigation.replace(`/workflows/${workflow.id}?step=${prevStep.id}`)
            }
          >
            <ArrowRight className="size-3 rotate-180" />
            <span className="ml-1 max-w-[200px] truncate">{prevStep.name}</span>
          </Button>
        ) : (
          <div />
        )}
        <span className="text-xs text-muted-foreground">
          {step.order} / {workflow.steps.length}
        </span>
        {nextStep ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigation.replace(`/workflows/${workflow.id}?step=${nextStep.id}`)
            }
          >
            <span className="mr-1 max-w-[200px] truncate">{nextStep.name}</span>
            <ArrowRight className="size-3" />
          </Button>
        ) : (
          <div />
        )}
      </div>
    </div>
  )
}
