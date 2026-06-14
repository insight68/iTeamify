"use client"

import { useState } from "react"
import { WorkflowStepCard } from "./workflow-step-card"
import type { WorkflowStep } from "../lib/types"

interface WorkflowTimelineProps {
  steps: WorkflowStep[]
}

export function WorkflowTimeline({ steps }: WorkflowTimelineProps) {
  const [activeStep, setActiveStep] = useState(0)

  return (
    <div className="py-4">
      {steps.map((step, index) => (
        <WorkflowStepCard
          key={step.id}
          step={step}
          isLast={index === steps.length - 1}
          isActive={activeStep === index}
          onActivate={() => setActiveStep(index)}
        />
      ))}
    </div>
  )
}
