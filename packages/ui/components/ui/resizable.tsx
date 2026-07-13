"use client"

import { createContext, useContext } from "react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@teamify/ui/lib/utils"

// Context for sharing orientation from PanelGroup to child Handle components.
// react-resizable-panels v4 sets aria-orientation on the Separator (opposite of
// the group direction), but does NOT set data-panel-group-direction.  We track
// the orientation ourselves so Handles can use the standard shadcn
// data-[panel-group-direction=vertical] selectors.
const OrientationContext = createContext<"horizontal" | "vertical">("horizontal")

function ResizablePanelGroup({
  className,
  orientation = "horizontal",
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <OrientationContext.Provider value={orientation}>
      <ResizablePrimitive.Group
        data-slot="resizable-panel-group"
        data-panel-group-direction={orientation}
        orientation={orientation}
        className={cn(
          "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
          className
        )}
        {...props}
      />
    </OrientationContext.Provider>
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
}) {
  const orientation = useContext(OrientationContext)

  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      data-panel-group-direction={orientation}
      className={cn(
        // Base styles — for horizontal group = vertical bar between side‑by‑side panels
        "relative flex w-px items-center justify-center",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-4 after:-translate-x-1/2",
        "before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-transparent before:transition-colors",
        "hover:before:bg-foreground/15 data-[separator=active]:before:bg-foreground/15",
        "focus-visible:outline-hidden",
        // Vertical group overrides — horizontal bar between stacked panels
        "data-[panel-group-direction=vertical]:h-px",
        "data-[panel-group-direction=vertical]:w-full",
        "data-[panel-group-direction=vertical]:before:inset-x-0",
        "data-[panel-group-direction=vertical]:before:inset-y-auto",
        "data-[panel-group-direction=vertical]:before:h-px",
        "data-[panel-group-direction=vertical]:before:w-full",
        "data-[panel-group-direction=vertical]:before:translate-x-0",
        "data-[panel-group-direction=vertical]:after:left-0",
        "data-[panel-group-direction=vertical]:after:h-4",
        "data-[panel-group-direction=vertical]:after:w-full",
        "data-[panel-group-direction=vertical]:after:translate-x-0",
        "data-[panel-group-direction=vertical]:after:-translate-y-1/2",
        // Rotate the grip dot for vertical orientation
        "[&[data-panel-group-direction=vertical]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" />
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
