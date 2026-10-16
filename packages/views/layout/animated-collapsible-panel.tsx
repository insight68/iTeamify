"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import type { Layout, PanelSize } from "react-resizable-panels";
import { cn } from "@iteamify/ui/lib/utils";

export const collapsiblePanelMotionProps = {
  "data-collapsible-panel": "true",
  style: { overflowX: "hidden" },
} as const;

const COLLAPSIBLE_PANEL_TRANSITION_MS = 220;
const COLLAPSIBLE_PANEL_SETTLE_MS = COLLAPSIBLE_PANEL_TRANSITION_MS + 80;

const collapsiblePanelTransition = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.8,
} as const;

export function getAnimatedCollapsiblePanelInitialOpen(
  defaultOpen: boolean,
  defaultLayout: Layout | undefined,
  panelId = "sidebar",
) {
  const restoredSize = defaultLayout?.[panelId];
  return typeof restoredSize === "number" ? restoredSize > 0 : defaultOpen;
}

function isCollapsiblePanelOpen(size: PanelSize) {
  return size.asPercentage > 0 || size.inPixels > 0;
}

export function useAnimatedCollapsiblePanelState(initialOpen: boolean) {
  const [open, setOpen] = useState(initialOpen);
  const [visualOpen, setVisualOpen] = useState(initialOpen);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const toggleTargetRef = useRef<boolean | null>(null);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginToggle = useCallback((nextOpen: boolean) => {
    toggleTargetRef.current = nextOpen;
    setMotionEnabled(true);
    setOpen(nextOpen);
    setVisualOpen(nextOpen);

    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current);
    }

    settleTimeoutRef.current = setTimeout(() => {
      toggleTargetRef.current = null;
      settleTimeoutRef.current = null;
      setMotionEnabled(false);
    }, COLLAPSIBLE_PANEL_SETTLE_MS);
  }, []);

  const handleResize = useCallback((size: PanelSize) => {
    const nextOpen = isCollapsiblePanelOpen(size);
    const toggleTarget = toggleTargetRef.current;

    if (toggleTarget === null) {
      setOpen(nextOpen);
      setVisualOpen(nextOpen);
      return;
    }

    setOpen(toggleTarget);
  }, []);

  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current) {
        clearTimeout(settleTimeoutRef.current);
      }
    };
  }, []);

  return { open, visualOpen, motionEnabled, beginToggle, handleResize };
}

export function AnimatedCollapsiblePanel({
  side,
  open,
  motionEnabled,
  children,
  className,
  contentClassName,
}: {
  side: "left" | "right";
  open: boolean;
  motionEnabled?: boolean;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <motion.div
      animate={{ opacity: open ? 1 : 0, x: open ? 0 : side === "left" ? -12 : 12 }}
      className={cn(
        "h-full overflow-x-hidden",
        side === "left" ? "border-r" : "border-l",
        !open && "pointer-events-none",
        className,
      )}
      initial={false}
      transition={motionEnabled ? collapsiblePanelTransition : { duration: 0 }}
    >
      {contentClassName ? <div className={contentClassName}>{children}</div> : children}
    </motion.div>
  );
}
