import type { ChatMessage } from "@teamify/core/types";
import type { ChatTimelineItem } from "@teamify/core/chat";

/**
 * Split an assistant timeline into two regions for the conductor-style fold:
 *   middle — everything from the first to the last non-text item (inclusive),
 *            including any text items sandwiched between them
 *   final  — text items after the last non-text item
 *
 * The preface (text before the first non-text item) is silently discarded.
 *
 * UI renders middle inside the outer fold (with each row keeping its existing
 * inner Collapsible), and final below the fold. Copy concatenates final only.
 */
export function splitTimeline(items: ChatTimelineItem[]): {
  middle: ChatTimelineItem[];
  final: ChatTimelineItem[];
} {
  const firstNonTextIdx = items.findIndex((i) => i.type !== "text");
  if (firstNonTextIdx === -1) {
    return { middle: [], final: items };
  }
  let lastNonTextIdx = items.length - 1;
  while (lastNonTextIdx >= 0 && items[lastNonTextIdx]!.type === "text") {
    lastNonTextIdx--;
  }
  return {
    middle: items.slice(firstNonTextIdx, lastNonTextIdx + 1),
    final: items.slice(lastNonTextIdx + 1),
  };
}

/**
 * Markdown source the Copy action puts on the clipboard. By design this is
 * the user-visible answer only — anything inside the outer fold (thinking,
 * tool calls, sandwiched intermediate text) is dropped. Falls back to
 * `message.content` for legacy messages without a timeline and for the
 * pathological all-non-text shape so Copy never produces an empty string.
 */
export function extractCopyText(
  message: ChatMessage,
  timeline: ChatTimelineItem[],
): string {
  if (timeline.length === 0) return message.content ?? "";
  // Inline extraction: only compute final (skip middle slice used by UI).
  let lastNonTextIdx = timeline.length - 1;
  while (lastNonTextIdx >= 0 && timeline[lastNonTextIdx]!.type === "text") {
    lastNonTextIdx--;
  }
  const final = timeline.slice(lastNonTextIdx + 1);
  const pieces = final.map((i) => i.content ?? "").filter((s) => s.length > 0);
  if (pieces.length === 0) return message.content ?? "";
  return pieces.join("\n\n");
}
