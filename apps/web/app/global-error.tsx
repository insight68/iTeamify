"use client";

import { useEffect } from "react";

/**
 * Root-level error boundary. Next.js renders this only when the root layout
 * itself throws — it replaces the entire document, so it must render its own
 * <html>/<body> and cannot rely on providers, fonts, or theme. Keep it
 * dependency-free and self-contained.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Best-effort telemetry. Analytics may not be initialised this early —
    // captureException buffers pre-init, and a failure here must never mask
    // the original error.
    void import("@teamify/core/analytics")
      .then(({ captureException }) =>
        captureException(error, {
          source: "web-global-error",
          digest: error.digest,
        }),
      )
      .catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "4rem 1.5rem",
          textAlign: "center",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#ffffff",
          color: "#0a0a0a",
        }}
      >
        <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
          Something went wrong.
        </h1>
        <p style={{ maxWidth: "28rem", fontSize: "0.875rem", color: "#666" }}>
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: "0.5rem",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            borderRadius: "0.375rem",
            border: "1px solid #d4d4d4",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
