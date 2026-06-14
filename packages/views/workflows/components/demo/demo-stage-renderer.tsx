"use client"

import type { DemoVisualType } from "../../lib/types"
import { DocumentScanView } from "./visual/document-scan-view"
import { DataComparisonView } from "./visual/data-comparison-view"
import { ReportView } from "./visual/report-view"
import { TimelineTrackerView } from "./visual/timeline-tracker-view"
import { ExtractionCardsView } from "./visual/extraction-cards-view"
import { FileOrganizationView } from "./visual/file-organization-view"

interface DemoStageRendererProps {
  visualType: DemoVisualType
  visualData: Record<string, unknown>
}

export function DemoStageRenderer({
  visualType,
  visualData,
}: DemoStageRendererProps) {
  switch (visualType) {
    case "document-scan":
      return <DocumentScanView data={visualData} />
    case "data-comparison":
      return <DataComparisonView data={visualData} />
    case "report-view":
      return <ReportView data={visualData} />
    case "timeline-tracker":
      return <TimelineTrackerView data={visualData} />
    case "extraction-cards":
      return <ExtractionCardsView data={visualData} />
    case "file-organization":
      return <FileOrganizationView data={visualData} />
    default:
      return (
        <div className="rounded-lg border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Unknown visual type: {visualType}
        </div>
      )
  }
}
