"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWSEvent } from "@iteamify/core/realtime";
import {
  runtimeKeys,
  runtimeListOptions,
} from "@iteamify/core/runtimes/queries";
import type { AgentRuntime } from "@iteamify/core/types";

/**
 * Step 3's runtime data layer, shared by Desktop (`StepRuntimeConnect`)
 * and Web (`StepPlatformFork`):
 *
 *   - Polls every 2s until a runtime is online, including when
 *     registered runtimes are temporarily offline.
 *   - `daemon:register` WS event triggers an instant refetch — no
 *     polling lag for online users.
 *   - Auto-selects online first, falls back to the first runtime.
 *     A valid manual selection survives subsequent refetches;
 *     a removed selection is replaced after loading completes.
 */
export function useRuntimePicker(wsId: string, initialSelectedId?: string): {
  runtimes: AgentRuntime[];
  selected: AgentRuntime | null;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  hasRuntimes: boolean;
} {
  const qc = useQueryClient();

  const { data: runtimes = [], isPending } = useQuery({
    ...runtimeListOptions(wsId, "me"),
    refetchInterval: (q) => (q.state.data?.some((runtime) => runtime.status === "online") ? false : 2000),
  });

  const handleDaemonEvent = useCallback(() => {
    qc.invalidateQueries({ queryKey: runtimeKeys.all(wsId) });
  }, [qc, wsId]);
  useWSEvent("daemon:register", handleDaemonEvent);

  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId || null);

  useEffect(() => {
    if (isPending || (selectedId && runtimes.some((runtime) => runtime.id === selectedId))) return;
    const preferred =
      runtimes.find((r) => r.status === "online") ?? runtimes[0];
    if (preferred) setSelectedId(preferred.id);
  }, [runtimes, selectedId, isPending]);

  const selected = runtimes.find((r) => r.id === selectedId) ?? null;

  return {
    runtimes,
    selected,
    selectedId,
    setSelectedId,
    hasRuntimes: runtimes.length > 0,
  };
}
