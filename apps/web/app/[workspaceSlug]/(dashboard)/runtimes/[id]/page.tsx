"use client";

import { use } from "react";
import { OwnerGuard } from "@teamify/views/layout";
import { RuntimeDetailPage } from "@teamify/views/runtimes";

export default function RuntimeDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <OwnerGuard>
      <RuntimeDetailPage runtimeId={id} />
    </OwnerGuard>
  );
}
