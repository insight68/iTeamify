"use client";

import { OwnerGuard } from "@teamify/views/layout";
import { AgentsPage } from "@teamify/views/agents";

export default function AgentsRoute() {
  return (
    <OwnerGuard>
      <AgentsPage />
    </OwnerGuard>
  );
}
