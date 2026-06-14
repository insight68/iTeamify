"use client"

import { use } from "react"
import { WorkflowDetailPage } from "@teamify/views/workflows"

export default function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ step?: string }>
}) {
  const { id } = use(params)
  const { step } = use(searchParams)
  return <WorkflowDetailPage workflowId={id} activeStepId={step} />
}
