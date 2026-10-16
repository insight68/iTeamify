import { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineEntry } from "@iteamify/core/types";
import { useActorName } from "@iteamify/core/workspace/hooks";
import {
  NavigationMinimap,
  waveScale,
  type NavigationMinimapItem,
} from "../../common/navigation-minimap";
import { minimapMarkdownPreview } from "../../common/minimap-preview";
import { useT } from "../../i18n";

// ---------------------------------------------------------------------------
// ThreadMinimap — issue-domain adapter for the shared quick-jump rail
// ---------------------------------------------------------------------------

/**
 * Flatten comment markdown into a plain-text preview. The first non-empty line
 * becomes the title; remaining lines form the secondary excerpt.
 */
export function commentPreview(markdown: string): { title: string; body: string } {
  return minimapMarkdownPreview(markdown);
}

// Preserve the existing public test/import surface while the implementation
// now lives in the shared minimap primitive.
export { waveScale };

export interface ThreadMinimapThread {
  /** Root comment id — also the `comment-${id}` DOM anchor of the rendered row. */
  id: string;
  /** The thread's root comment entry (preview text + author fallback). */
  entry: TimelineEntry;
}

interface ThreadMinimapProps {
  threads: ThreadMinimapThread[];
  /** The issue detail scroll container; null until its callback ref populates. */
  scrollContainerEl: HTMLElement | null;
  onJump: (threadId: string) => void;
  className?: string;
}

function sameIdSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/**
 * Resolve the comment roots intersecting the scroll viewport. DOM measurement
 * is intentional: issue detail can switch between virtualized and flat render
 * modes, and this works for both without coupling the rail to either list.
 */
function useVisibleThreadIds(
  threads: ThreadMinimapThread[],
  scrollContainerEl: HTMLElement | null,
): Set<string> {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const container = scrollContainerEl;
    if (!container) return;

    let raf = 0;
    const compute = () => {
      raf = 0;
      const rect = container.getBoundingClientRect();
      const next = new Set<string>();
      for (const thread of threads) {
        const element = document.getElementById(`comment-${thread.id}`);
        if (!element) continue;
        const elementRect = element.getBoundingClientRect();
        if (elementRect.bottom > rect.top && elementRect.top < rect.bottom) {
          next.add(thread.id);
        }
      }
      setVisibleIds((prev) => (sameIdSet(prev, next) ? prev : next));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };

    compute();
    container.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
    return () => {
      container.removeEventListener("scroll", schedule);
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [threads, scrollContainerEl]);

  return visibleIds;
}

export function ThreadMinimap({
  threads,
  scrollContainerEl,
  onJump,
  className,
}: ThreadMinimapProps) {
  const { t } = useT("issues");
  const { getActorName } = useActorName();
  const visibleIds = useVisibleThreadIds(threads, scrollContainerEl);

  // Cache flattened previews by id + content so unrelated timeline updates do
  // not repeatedly flatten every comment.
  const previousPreviewsRef = useRef<
    Map<string, { content: string | undefined; preview: { title: string; body: string } }>
  >(new Map());
  const items = useMemo<NavigationMinimapItem[]>(() => {
    const next = new Map<
      string,
      { content: string | undefined; preview: { title: string; body: string } }
    >();
    const result = threads.map((thread) => {
      const cached = previousPreviewsRef.current.get(thread.id);
      const preview =
        cached && cached.content === thread.entry.content
          ? cached.preview
          : commentPreview(thread.entry.content ?? "");
      next.set(thread.id, { content: thread.entry.content, preview });
      return {
        id: thread.id,
        title:
          preview.title ||
          getActorName(thread.entry.actor_type, thread.entry.actor_id),
        body: preview.body,
      };
    });
    previousPreviewsRef.current = next;
    return result;
  }, [getActorName, threads]);

  return (
    <NavigationMinimap
      items={items}
      activeIds={visibleIds}
      onJump={onJump}
      ariaLabel={t(($) => $.detail.thread_nav_label)}
      className={className}
    />
  );
}
