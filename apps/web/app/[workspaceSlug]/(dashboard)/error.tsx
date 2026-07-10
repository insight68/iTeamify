"use client";

import { useEffect } from "react";
import { Button } from "@teamify/ui/components/ui/button";
import { captureException } from "@teamify/core/analytics";

/**
 * Route-level error boundary for every dashboard page. Next.js renders this
 * in place of the segment's UI when a render-time error escapes — so a crash
 * in settings / agents / projects / inbox / etc. degrades to a recoverable
 * panel instead of white-screening the whole app. The narrower section-level
 * <ErrorBoundary> wrappers on issues / chats still catch first; this is the
 * backstop for every route that has none.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { source: "web-route-error", digest: error.digest });
  }, [error]);

  return (
    <main
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center"
    >
      <h1 className="text-lg font-semibold tracking-tight">
        Something went wrong.
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred while loading this page."}
      </p>
      <Button variant="outline" onClick={reset} className="mt-2">
        Try again
      </Button>
    </main>
  );
}
