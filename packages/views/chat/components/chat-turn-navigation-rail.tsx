"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { ChatMessage } from "@teamify/core/types";
import { cn } from "@teamify/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@teamify/ui/components/ui/tooltip";
import { useT } from "../../i18n";

export const CHAT_TURN_NAVIGATION_MIN_TURNS = 2;
const MIN_LEFT_GUTTER_PX = 48;
const TURN_TOP_TOLERANCE_PX = 24;
const PREVIEW_CHAR_LIMIT = 320;
const RAIL_FADE_PX = 12;

type RailFade = "none" | "top" | "bottom" | "both";

export interface ChatTurnNavigationItem {
  id: string;
  prompt: string;
  response: string;
  isPending: boolean;
}

export type ChatTurnNavigationLayout = "hidden" | "standard" | "compact";

/**
 * Chat messages are stored as a chronological stream, while the navigation
 * rail needs user-prompt-led turns. Deriving the view model here keeps the
 * feature compatible with legacy sessions and avoids adding persisted UI
 * state to either the API or Zustand.
 */
export function buildChatTurnNavigationItems(
  messages: ChatMessage[],
  isStreaming: boolean,
): ChatTurnNavigationItem[] {
  const turns: ChatTurnNavigationItem[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      turns.push({
        id: message.id,
        prompt: compactPreview(message.content),
        response: "",
        isPending: false,
      });
      continue;
    }

    const current = turns.at(-1);
    if (!current) continue;

    const response = compactPreview(message.content);
    if (response) {
      const combined = current.response
        ? `${current.response} ${response}`
        : response;
      current.response = combined.slice(0, PREVIEW_CHAR_LIMIT).trimEnd();
    }
  }

  if (isStreaming && turns.length > 0) {
    turns[turns.length - 1]!.isPending = true;
  }

  return turns;
}

function compactPreview(markdown: string): string {
  return markdown
    .replace(/^Context:[^\n]*(?:\n+|$)/i, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/```[a-z0-9_-]*\n?/gi, " ")
    .replace(/[`*_~>#|]/g, "")
    .replace(/^\s*(?:[-+] |\d+\. )/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PREVIEW_CHAR_LIMIT)
    .trimEnd();
}

interface ChatTurnNavigationRailProps {
  items: ChatTurnNavigationItem[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onLayoutChange?: (layout: ChatTurnNavigationLayout) => void;
}

export function ChatTurnNavigationRail({
  items,
  scrollContainerRef,
  onLayoutChange,
}: ChatTurnNavigationRailProps) {
  const { t } = useT("chat");
  const railRef = useRef<HTMLElement>(null);
  const railListRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const lastScrubIndexRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const intersectingIdsRef = useRef<Set<string>>(new Set());
  const [hasNaturalGutter, setHasNaturalGutter] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [railFade, setRailFade] = useState<RailFade>("none");
  const [primaryActiveId, setPrimaryActiveId] = useState<string | null>(
    items[0]?.id ?? null,
  );
  const [visibleIds, setVisibleIds] = useState<Set<string>>(
    () => new Set(items[0] ? [items[0].id] : []),
  );

  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const layout: ChatTurnNavigationLayout =
    items.length < CHAT_TURN_NAVIGATION_MIN_TURNS
      ? "hidden"
      : hasNaturalGutter
        ? "standard"
        : "compact";
  const showVisualRail = layout !== "hidden";

  useEffect(() => {
    onLayoutChange?.(layout);
  }, [layout, onLayoutChange]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const content = scrollContainer.querySelector<HTMLElement>(
      "[data-chat-turn-content]",
    );
    if (!content) return;

    const updateRoom = () => {
      const scrollRect = scrollContainer.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      setHasNaturalGutter(
        contentRect.left - scrollRect.left >= MIN_LEFT_GUTTER_PX,
      );
    };

    updateRoom();
    const observer = new ResizeObserver(updateRoom);
    observer.observe(scrollContainer);
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollContainerRef, items.length]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || itemIds.length === 0) return;

    const anchors = findTurnAnchors(scrollContainer, itemIds);
    if (anchors.length === 0) return;

    const rootTop = scrollContainer.getBoundingClientRect().top;
    const currentAnchor =
      anchors.findLast(
        (anchor) =>
          anchor.getBoundingClientRect().top - rootTop <=
          TURN_TOP_TOLERANCE_PX,
      ) ?? anchors[0]!;
    const currentId = currentAnchor.dataset.chatTurnId!;
    setVisibleIds(new Set([currentId]));
    setPrimaryActiveId(currentId);
    intersectingIdsRef.current.clear();

    let scrollFrame = 0;
    const updatePrimaryTurn = () => {
      scrollFrame = 0;
      const currentRootTop = scrollContainer.getBoundingClientRect().top;
      const primary =
        anchors.findLast(
          (anchor) =>
            anchor.getBoundingClientRect().top - currentRootTop <=
            TURN_TOP_TOLERANCE_PX,
        ) ?? anchors[0]!;
      setPrimaryActiveId(primary.dataset.chatTurnId ?? null);
    };
    const handleScroll = () => {
      if (scrollFrame !== 0) return;
      scrollFrame = requestAnimationFrame(updatePrimaryTurn);
    };
    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });

    if (typeof IntersectionObserver === "undefined") {
      return () => {
        scrollContainer.removeEventListener("scroll", handleScroll);
        if (scrollFrame !== 0) cancelAnimationFrame(scrollFrame);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.chatTurnId;
          if (!id) continue;
          if (entry.isIntersecting) intersectingIdsRef.current.add(id);
          else intersectingIdsRef.current.delete(id);
        }
        if (intersectingIdsRef.current.size > 0) {
          setVisibleIds(new Set(intersectingIdsRef.current));
        }
      },
      {
        root: scrollContainer,
        rootMargin: "-16px 0px 0px 0px",
        threshold: 0,
      },
    );

    for (const anchor of anchors) observer.observe(anchor);
    return () => {
      observer.disconnect();
      scrollContainer.removeEventListener("scroll", handleScroll);
      if (scrollFrame !== 0) cancelAnimationFrame(scrollFrame);
    };
  }, [itemIds, scrollContainerRef]);

  const jumpToTurn = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const scrollContainer = scrollContainerRef.current;
      const item = items[index];
      if (!scrollContainer || !item) return;

      const anchor = findTurnAnchor(scrollContainer, item.id);
      if (!anchor) return;

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      anchor.scrollIntoView({
        behavior: reduceMotion ? "auto" : behavior,
        block: "start",
      });

      const prompt =
        anchor.querySelector<HTMLElement>("[data-chat-turn-prompt]") ??
        anchor;
      if (!reduceMotion && typeof prompt.animate === "function") {
        prompt.animate(
          [
            { boxShadow: "0 0 0 0 transparent" },
            {
              boxShadow:
                "0 0 0 3px color-mix(in oklab, var(--primary) 22%, transparent)",
            },
            { boxShadow: "0 0 0 0 transparent" },
          ],
          { duration: 900, easing: "ease-out" },
        );
      }
    },
    [items, scrollContainerRef],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.key !== "ArrowUp" && event.key !== "ArrowDown")
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element) || isEditableTarget(target)) return;

      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer?.isConnected) return;

      const anchors = findTurnAnchors(scrollContainer, itemIds);
      if (anchors.length === 0) return;

      const rootTop = scrollContainer.getBoundingClientRect().top;
      const tops = anchors.map(
        (anchor) => anchor.getBoundingClientRect().top - rootTop,
      );
      let targetIndex = -1;

      if (event.key === "ArrowDown") {
        targetIndex = tops.findIndex((top) => top > TURN_TOP_TOLERANCE_PX);
      } else {
        let currentIndex = -1;
        for (let index = 0; index < tops.length; index += 1) {
          if (tops[index]! <= TURN_TOP_TOLERANCE_PX) currentIndex = index;
        }
        if (currentIndex >= 0) {
          targetIndex =
            Math.abs(tops[currentIndex]!) <= TURN_TOP_TOLERANCE_PX
              ? currentIndex - 1
              : currentIndex;
        }
      }

      if (targetIndex < 0 || targetIndex >= items.length) return;
      event.preventDefault();
      jumpToTurn(targetIndex);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [itemIds, items.length, jumpToTurn, scrollContainerRef]);

  useEffect(() => {
    const list = railListRef.current;
    if (!list || !primaryActiveId) return;

    const activeIndex = items.findIndex((item) => item.id === primaryActiveId);
    const button = list.querySelector<HTMLElement>(
      `[data-chat-turn-nav-index="${activeIndex}"]`,
    );
    if (!button) return;

    const top = button.offsetTop;
    const bottom = top + button.offsetHeight;
    const visibleTop = list.scrollTop;
    const visibleBottom = visibleTop + list.clientHeight;
    if (top < visibleTop) list.scrollTop = top;
    else if (bottom > visibleBottom) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [items, primaryActiveId]);

  useEffect(() => {
    if (!showVisualRail) {
      setRailFade("none");
      return;
    }

    const list = railListRef.current;
    if (!list) return;

    const updateFade = () => {
      const scrollable = list.scrollHeight - list.clientHeight;
      if (scrollable <= 1) {
        setRailFade("none");
        return;
      }

      const atTop = list.scrollTop <= 1;
      const atBottom = list.scrollTop >= scrollable - 1;
      if (atTop) setRailFade("bottom");
      else if (atBottom) setRailFade("top");
      else setRailFade("both");
    };

    const frame = requestAnimationFrame(updateFade);
    list.addEventListener("scroll", updateFade, { passive: true });
    const observer = new ResizeObserver(updateFade);
    observer.observe(list);
    return () => {
      cancelAnimationFrame(frame);
      list.removeEventListener("scroll", updateFade);
      observer.disconnect();
    };
  }, [items.length, showVisualRail]);

  const updatePointerIndex = useCallback(
    (rail: HTMLElement, clientY: number, shouldJump: boolean) => {
      const closestIndex = closestTurnIndex(rail, clientY);
      if (closestIndex === null) return;
      setHoveredIndex(closestIndex);

      if (!shouldJump || closestIndex === lastScrubIndexRef.current) return;
      lastScrubIndexRef.current = closestIndex;
      jumpToTurn(closestIndex, "auto");
    },
    [jumpToTurn],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const closestIndex = closestTurnIndex(event.currentTarget, event.clientY);
    if (closestIndex === null) return;

    pointerIdRef.current = event.pointerId;
    suppressClickRef.current = true;
    lastScrubIndexRef.current = null;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updatePointerIndex(event.currentTarget, event.clientY, true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    updatePointerIndex(
      event.currentTarget,
      event.clientY,
      pointerIdRef.current === event.pointerId,
    );
  };

  const stopScrubbing = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerIdRef.current = null;
    lastScrubIndexRef.current = null;
  };

  if (!showVisualRail) return null;

  const primaryActiveIndex = Math.max(
    0,
    items.findIndex((item) => item.id === primaryActiveId),
  );
  const magneticCenterIndex = hoveredIndex ?? primaryActiveIndex;

  return (
    <nav
      ref={railRef}
      aria-label={t(($) => $.turn_navigation.aria_label)}
      data-layout={layout}
      className={cn(
        "absolute inset-y-3 z-20 flex items-end",
        layout === "compact" ? "left-1.5" : "left-3",
      )}
      onPointerLeave={() => {
        if (pointerIdRef.current === null) setHoveredIndex(null);
      }}
      onFocus={(event) => {
        const button = (event.target as Element).closest<HTMLElement>(
          "[data-chat-turn-nav-index]",
        );
        if (button) setHoveredIndex(Number(button.dataset.chatTurnNavIndex));
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHoveredIndex(null);
        }
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopScrubbing}
      onPointerCancel={(event) => {
        stopScrubbing(event);
        setHoveredIndex(null);
      }}
    >
      <TooltipProvider delay={200}>
        <div
          ref={railListRef}
          data-chat-turn-rail-list
          style={railFadeStyle(railFade)}
          className="max-h-[min(100%,34rem)] overflow-y-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item, index) => {
            const isPrimaryActive = item.id === primaryActiveId;
            const isVisible = visibleIds.has(item.id);
            const isHovered = index === hoveredIndex;
            const scale = markerScale(Math.abs(magneticCenterIndex - index));

            return (
              <Tooltip key={item.id}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      data-chat-turn-nav-index={index}
                      aria-label={t(($) => $.turn_navigation.jump_to_turn, {
                        position: index + 1,
                      })}
                      aria-current={isPrimaryActive ? "step" : undefined}
                      className={cn(
                        "group flex h-[18px] touch-none items-center outline-none",
                        layout === "compact" ? "w-5" : "w-[30px]",
                      )}
                      onClick={() => {
                        if (suppressClickRef.current) {
                          suppressClickRef.current = false;
                          return;
                        }
                        jumpToTurn(index);
                      }}
                    />
                  }
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "block h-[1.5px] origin-left rounded-full transition-[height,transform,background-color,opacity] duration-150",
                      layout === "compact" ? "w-[18px]" : "w-6",
                      item.isPending
                        ? "h-0.5 animate-pulse bg-brand/75 opacity-100 motion-reduce:animate-none"
                        : isPrimaryActive
                          ? "h-[2.5px] bg-foreground/85 opacity-100"
                          : isHovered
                            ? "bg-foreground/65 opacity-90"
                            : isVisible
                              ? "bg-muted-foreground/60 opacity-75"
                              : "bg-muted-foreground/40 opacity-55 group-focus-visible:bg-foreground/65 group-focus-visible:opacity-90",
                    )}
                    style={{ transform: `scaleX(${scale})` }}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  sideOffset={layout === "compact" ? 6 : 8}
                  align="center"
                  className="block w-72 max-w-[min(18rem,calc(100vw-4.5rem))] rounded-xl bg-popover/95 px-3 py-2.5 text-left shadow-lg backdrop-blur-sm"
                >
                  <div className="mb-1 flex items-center justify-between gap-4 text-[10px] font-medium tracking-wide text-muted-foreground/80">
                    <span>
                      {t(($) => $.turn_navigation.turn_label, {
                        position: index + 1,
                      })}
                    </span>
                    <span>{t(($) => $.turn_navigation.shortcut_hint)}</span>
                  </div>
                  <p className="line-clamp-2 text-[13px] font-medium leading-[1.35] text-popover-foreground">
                    {item.prompt}
                  </p>
                  <p
                    className={cn(
                      "mt-1.5 line-clamp-3 text-xs leading-relaxed",
                      item.response
                        ? "text-muted-foreground"
                        : "italic text-muted-foreground/70",
                    )}
                  >
                    {item.isPending ? (
                      <span className="inline-flex items-center gap-1.5 not-italic text-muted-foreground">
                        <span className="size-1 rounded-full bg-brand/80 animate-pulse motion-reduce:animate-none" />
                        {t(($) => $.turn_navigation.responding)}
                      </span>
                    ) : (
                      item.response || t(($) => $.turn_navigation.no_response)
                    )}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </nav>
  );
}

function markerScale(distance: number): number {
  if (distance === 0) return 1;
  if (distance === 1) return 0.63;
  if (distance === 2) return 0.42;
  if (distance === 3) return 0.29;
  return 0.21;
}

function closestTurnIndex(
  rail: HTMLElement,
  clientY: number,
): number | null {
  const buttons = Array.from(
    rail.querySelectorAll<HTMLButtonElement>("[data-chat-turn-nav-index]"),
  );
  if (buttons.length === 0) return null;

  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const button of buttons) {
    const rect = button.getBoundingClientRect();
    const distance = Math.abs(clientY - (rect.top + rect.height / 2));
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = Number(button.dataset.chatTurnNavIndex);
    }
  }
  return closestIndex;
}

function railFadeStyle(fade: RailFade): CSSProperties | undefined {
  if (fade === "none") return undefined;

  const top =
    fade === "top" || fade === "both"
      ? `transparent 0%, black ${RAIL_FADE_PX}px`
      : "black 0%";
  const bottom =
    fade === "bottom" || fade === "both"
      ? `black calc(100% - ${RAIL_FADE_PX}px), transparent 100%`
      : "black 100%";
  const maskImage = `linear-gradient(to bottom, ${top}, ${bottom})`;

  return { maskImage, WebkitMaskImage: maskImage };
}

function findTurnAnchors(
  scrollContainer: HTMLElement,
  itemIds: string[],
): HTMLElement[] {
  const byId = new Map(
    Array.from(
      scrollContainer.querySelectorAll<HTMLElement>("[data-chat-turn-id]"),
    ).map((element) => [element.dataset.chatTurnId, element]),
  );
  return itemIds.flatMap((id) => {
    const element = byId.get(id);
    return element ? [element] : [];
  });
}

function findTurnAnchor(
  scrollContainer: HTMLElement,
  itemId: string,
): HTMLElement | undefined {
  return Array.from(
    scrollContainer.querySelectorAll<HTMLElement>("[data-chat-turn-id]"),
  ).find((element) => element.dataset.chatTurnId === itemId);
}

function isEditableTarget(target: Element): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.closest("[contenteditable='true']") !== null
  );
}
