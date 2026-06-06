"use client";

import { IssuesPage } from "@teamify/views/issues/components";
import { ErrorBoundary } from "@teamify/ui/components/common/error-boundary";

export default function Page() {
  return (
    <ErrorBoundary>
      <IssuesPage />
    </ErrorBoundary>
  );
}
