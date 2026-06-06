import { api } from "../api";
import type { RuntimeHermesProfileResult } from "../types";

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 60_000;

export async function resolveHermesProfiles(
  runtimeId: string,
): Promise<RuntimeHermesProfileResult> {
  const initial = await api.initiateListHermesProfiles(runtimeId);
  const start = Date.now();
  let current = initial;

  while (current.status === "pending" || current.status === "running") {
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      throw new Error("Hermes profile discovery timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    current = await api.getHermesProfileListResult(runtimeId, initial.id);
  }

  if (current.status === "failed" || current.status === "timeout") {
    throw new Error(current.error || "Hermes profile discovery failed");
  }

  return {
    profiles: current.profiles ?? [],
    supported: current.supported,
  };
}
