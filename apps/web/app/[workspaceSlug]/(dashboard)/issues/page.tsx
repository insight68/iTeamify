"use client";

import { IssuesPage } from "@iteamify/views/issues/components/issues-page";
import { ErrorBoundary } from "@iteamify/ui/components/common/error-boundary";

export default function Page() {
  return (
    <ErrorBoundary>
      <IssuesPage />
    </ErrorBoundary>
  );
}
