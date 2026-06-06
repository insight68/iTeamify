"use client";

import { OwnerGuard } from "@teamify/views/layout";
import { RuntimesPage } from "@teamify/views/runtimes";

export default function RuntimesRoute() {
  return (
    <OwnerGuard>
      <RuntimesPage />
    </OwnerGuard>
  );
}
