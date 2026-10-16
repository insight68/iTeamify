import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@iteamify/ui/lib/utils";

/** Intent delay before the preview first appears. Gliding afterwards is instant. */
const PREVIEW_OPEN_DELAY_MS = 150;
/** Grace period long enough to move from the rail onto the preview card. */
const PREVIEW_CLOSE_DELAY_MS = 150;

/** Distance at which a tick stops responding to the pointer wave. */
const WAVE_RADIUS_PX = 56;
/** Peak horizontal scale of the tick nearest the pointer. */
const WAVE_MAX_SCALE = 1.7;

export interface NavigationMinimapItem {
  id: string;
  /** Accessible label and preview-card heading. */
  title: string;
  /** Optional secondary preview text. */
  body?: string;
}

export interface NavigationMinimapLeadingAction {
  label: string;
  onActivate: () => void;
  pending?: boolean;
}

interface NavigationMinimapProps {
  items: NavigationMinimapItem[];
  activeIds?: ReadonlySet<string>;
  onJump: (id: string) => void;
  ariaLabel: string;
  /** An optional pagination affordance rendered before the first tick. */
  leadingAction?: NavigationMinimapLeadingAction;
  /** Hide short maps that are not worth the pixels. Defaults to two items. */
  minItems?: number;
  className?: string;
}

interface PreviewAnchor {
  index: number;
  y: number;
}

/**
 * Cosine-squared bell used by the Codex-style proximity wave. It is smooth at
 * both the peak and the radius edge, so moving across densely packed ticks
 * never produces a visible kink.
 */
export function waveScale(distancePx: number): number {
  const d = Math.abs(distancePx);
  if (d >= WAVE_RADIUS_PX) return 1;
  const t = Math.cos(((d / WAVE_RADIUS_PX) * Math.PI) / 2);
  return 1 + (WAVE_MAX_SCALE - 1) * t * t;
}

function MinimapTick({
  item,
  active,
  previewOpen,
  onClick,
}: {
  item: NavigationMinimapItem;
  active: boolean;
  previewOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-minimap-tick
      aria-label={item.title}
      onClick={onClick}
      className="group/tick flex min-h-[5px] w-5 flex-[0_1_0.875rem] cursor-pointer items-center justify-end focus-visible:outline-none"
    >
      <span
        className={cn(
          "h-0.5 w-3 origin-right rounded-full transition-[scale,background-color] duration-100 ease-out",
          active ? "bg-foreground/70" : "bg-muted-foreground/30",
          "group-hover/tick:bg-foreground",
          previewOpen && "scale-x-[1.7] bg-foreground",
          "group-focus-visible/tick:scale-x-[1.7] group-focus-visible/tick:bg-foreground",
          "motion-reduce:group-hover/tick:scale-x-[1.7]",
        )}
      />
    </button>
  );
}

/**
 * Shared quick-jump rail used by long, virtualized timelines. Domain adapters
 * own item derivation, active-item calculation, and the actual scroll jump;
 * this component owns the compact rail, proximity wave, preview card, and
 * pointer/keyboard parity.
 */
export function NavigationMinimap({
  items,
  activeIds,
  onJump,
  ariaLabel,
  leadingAction,
  minItems = 2,
  className,
}: NavigationMinimapProps) {
  const shimRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const waveRafRef = useRef(0);
  const pointerYRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);

  const [preview, setPreview] = useState<PreviewAnchor | null>(null);
  const previewRef = useRef<PreviewAnchor | null>(null);
  const pendingAnchorRef = useRef<PreviewAnchor | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const showPreview = useCallback((anchor: PreviewAnchor | null) => {
    previewRef.current = anchor;
    setPreview((prev) =>
      prev?.index === anchor?.index && prev?.y === anchor?.y ? prev : anchor,
    );
  }, []);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => {
      if (waveRafRef.current) cancelAnimationFrame(waveRafRef.current);
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      showPreview(null);
    }, PREVIEW_CLOSE_DELAY_MS);
  }, [cancelClose, showPreview]);

  const runWave = useCallback(() => {
    waveRafRef.current = 0;
    const nav = navRef.current;
    const shim = shimRef.current;
    if (!nav || !shim) return;

    const y = pointerYRef.current;
    const buttons = nav.querySelectorAll<HTMLButtonElement>("button[data-minimap-tick]");
    const shimTop = shim.getBoundingClientRect().top;
    const shimHeight = shim.clientHeight;
    const cardHalf = (cardRef.current?.offsetHeight ?? 96) / 2;
    const scales: string[] = [];
    let nearest: { index: number; centerY: number; dist: number } | null = null;

    buttons.forEach((button, index) => {
      if (y === null) {
        scales.push("");
        return;
      }
      const rect = button.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const dist = Math.abs(y - centerY);
      const scale = reducedMotionRef.current ? 1 : waveScale(y - centerY);
      scales.push(scale > 1.001 ? `${scale.toFixed(3)} 1` : "");
      if (!nearest || dist < nearest.dist) nearest = { index, centerY, dist };
    });

    buttons.forEach((button, index) => {
      const tick = button.firstElementChild as HTMLElement | null;
      if (!tick) return;
      const scale = scales[index]!;
      if (scale) tick.style.setProperty("scale", scale);
      else tick.style.removeProperty("scale");
    });

    if (y === null || !nearest) return;
    const { index, centerY } = nearest as { index: number; centerY: number };
    const anchor: PreviewAnchor = {
      index,
      y: Math.min(Math.max(centerY - shimTop, cardHalf + 6), shimHeight - cardHalf - 6),
    };
    pendingAnchorRef.current = anchor;

    if (previewRef.current) {
      showPreview(anchor);
    } else if (openTimerRef.current === null) {
      openTimerRef.current = window.setTimeout(() => {
        openTimerRef.current = null;
        if (pointerYRef.current !== null) showPreview(pendingAnchorRef.current);
      }, PREVIEW_OPEN_DELAY_MS);
    }
  }, [showPreview]);

  const scheduleWave = useCallback(() => {
    if (!waveRafRef.current) waveRafRef.current = requestAnimationFrame(runWave);
  }, [runWave]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if ((event.target as HTMLElement).closest("button[data-minimap-leading]")) {
        pointerYRef.current = null;
        scheduleWave();
        scheduleClose();
        return;
      }
      cancelClose();
      pointerYRef.current = event.clientY;
      scheduleWave();
    },
    [cancelClose, scheduleClose, scheduleWave],
  );

  const handlePointerLeave = useCallback(() => {
    pointerYRef.current = null;
    scheduleWave();
    scheduleClose();
  }, [scheduleClose, scheduleWave]);

  const handleFocus = useCallback(
    (event: React.FocusEvent) => {
      const nav = navRef.current;
      const shim = shimRef.current;
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "button[data-minimap-tick]",
      );
      if (!nav || !shim || !button) return;

      cancelClose();
      const buttons = [...nav.querySelectorAll<HTMLButtonElement>("button[data-minimap-tick]")];
      const index = buttons.indexOf(button);
      if (index < 0) return;
      const rect = button.getBoundingClientRect();
      const cardHalf = (cardRef.current?.offsetHeight ?? 96) / 2;
      const y = rect.top + rect.height / 2 - shim.getBoundingClientRect().top;
      showPreview({
        index,
        y: Math.min(Math.max(y, cardHalf + 6), shim.clientHeight - cardHalf - 6),
      });
    },
    [cancelClose, showPreview],
  );

  if (items.length < minItems && !leadingAction) return null;

  const activeItem = preview ? items[preview.index] : undefined;

  return (
    <div
      ref={shimRef}
      className={cn("pointer-events-none z-10 flex flex-col justify-center py-6", className)}
    >
      <nav
        ref={navRef}
        aria-label={ariaLabel}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onFocusCapture={handleFocus}
        onBlurCapture={scheduleClose}
        className="pointer-events-auto flex max-h-full flex-col overflow-hidden"
      >
        {leadingAction && (
          <button
            type="button"
            data-minimap-leading
            aria-label={leadingAction.label}
            title={leadingAction.label}
            disabled={leadingAction.pending}
            onClick={leadingAction.onActivate}
            className="group/older mb-1 flex min-h-2 w-5 shrink-0 cursor-pointer items-center justify-end focus-visible:outline-none disabled:cursor-wait"
          >
            <span
              className={cn(
                "h-1 w-1 rounded-full bg-muted-foreground/35 transition-[scale,background-color] duration-100",
                "group-hover/older:scale-150 group-hover/older:bg-foreground",
                "group-focus-visible/older:scale-150 group-focus-visible/older:bg-foreground",
                leadingAction.pending && "animate-pulse bg-foreground/60",
              )}
            />
          </button>
        )}

        {items.map((item, index) => (
          <MinimapTick
            key={item.id}
            item={item}
            active={activeIds?.has(item.id) ?? false}
            previewOpen={preview?.index === index}
            onClick={() => onJump(item.id)}
          />
        ))}
      </nav>

      {preview && activeItem && (
        <div
          ref={cardRef}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
          className="pointer-events-auto absolute right-8 top-0 w-72 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-transform duration-150 ease-out motion-reduce:transition-none"
          style={{ transform: `translateY(${preview.y}px) translateY(-50%)` }}
        >
          <p className="truncate text-sm font-semibold text-foreground">{activeItem.title}</p>
          {activeItem.body && (
            <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{activeItem.body}</p>
          )}
        </div>
      )}
    </div>
  );
}
