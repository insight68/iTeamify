import type { TaskMessagePayload } from "@iteamify/core/types";

/** Mirror core chat history merging; keep live events received during a snapshot fetch. */
export function mergeTaskMessages(existing: TaskMessagePayload[], incoming: TaskMessagePayload[]) {
  const seen = new Set(existing.map((message) => message.seq));
  const added = incoming.filter((message) => {
    if (seen.has(message.seq)) return false;
    seen.add(message.seq);
    return true;
  });
  return added.length ? [...existing, ...added].sort((a, b) => a.seq - b.seq) : existing;
}
