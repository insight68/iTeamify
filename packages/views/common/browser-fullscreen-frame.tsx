"use client";

import * as React from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@teamify/ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@teamify/ui/components/ui/tooltip";
import { cn } from "@teamify/ui/lib/utils";

interface BrowserFullscreenFrameProps {
  enterLabel: string;
  exitLabel: string;
  className?: string;
  children: (
    fullscreenControl: React.ReactNode,
    isFullscreen: boolean,
    containerRef: React.RefObject<HTMLDivElement | null>,
  ) => React.ReactNode;
}

export function BrowserFullscreenFrame({
  enterLabel,
  exitLabel,
  className,
  children,
}: BrowserFullscreenFrameProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, []);

  const toggleFullscreen = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (document.fullscreenElement === container) {
      if (typeof document.exitFullscreen === "function") {
        void document.exitFullscreen().catch(() => undefined);
      }
      return;
    }

    if (typeof container.requestFullscreen === "function") {
      void container.requestFullscreen().catch(() => undefined);
    }
  }, []);

  const label = isFullscreen ? exitLabel : enterLabel;
  const Icon = isFullscreen ? Minimize2 : Maximize2;
  const fullscreenControl = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={toggleFullscreen}
            aria-label={label}
            title={label}
          >
            <Icon className="size-3.5" />
          </Button>
        }
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <div
      ref={containerRef}
      data-slot="browser-fullscreen-frame"
      data-fullscreen={isFullscreen ? "true" : undefined}
      className={cn(
        "relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden bg-background data-[fullscreen=true]:h-screen data-[fullscreen=true]:w-screen data-[fullscreen=true]:p-2",
        className,
      )}
    >
      {children(fullscreenControl, isFullscreen, containerRef)}
    </div>
  );
}
