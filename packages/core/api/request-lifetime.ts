/** A deadline covers headers and body decoding; cancellation also settles non-cooperative transports. */
export function createRequestLifetime(signals: readonly (AbortSignal | undefined | null)[], timeoutMs: number) {
  const controller = new AbortController();
  const cleanups: (() => void)[] = [];
  for (const signal of signals) {
    if (!signal) continue;
    const abort = () => controller.abort(signal.reason ?? new DOMException("Request cancelled", "AbortError"));
    if (signal.aborted) abort();
    else {
      signal.addEventListener("abort", abort, { once: true });
      cleanups.push(() => signal.removeEventListener("abort", abort));
    }
  }
  const timer = setTimeout(() => {
    controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    async run<T>(operation: () => Promise<T>): Promise<T> {
      let rejectOnAbort: (() => void) | undefined;
      try {
        controller.signal.throwIfAborted();
        const cancelled = new Promise<never>((_resolve, reject) => {
          rejectOnAbort = () => reject(controller.signal.reason);
          controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
        });
        return await Promise.race([operation(), cancelled]);
      } finally {
        clearTimeout(timer);
        if (rejectOnAbort) controller.signal.removeEventListener("abort", rejectOnAbort);
        for (const cleanup of cleanups) cleanup();
      }
    },
  };
}
