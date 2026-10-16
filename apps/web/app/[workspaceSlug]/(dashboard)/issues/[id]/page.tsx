"use client";

import { use } from "react";
import { IssueDetail } from "@iteamify/views/issues/components";
import { ErrorBoundary } from "@iteamify/ui/components/common/error-boundary";

export default function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <ErrorBoundary resetKeys={[id]}>
      <IssueDetail issueId={id} />
    </ErrorBoundary>
  );
}
