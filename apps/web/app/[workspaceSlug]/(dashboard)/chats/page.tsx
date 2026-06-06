"use client";

import { ChatPage } from "@teamify/views/chat";
import { ErrorBoundary } from "@teamify/ui/components/common/error-boundary";

export default function Page() {
  return (
    <ErrorBoundary>
      <ChatPage />
    </ErrorBoundary>
  );
}
