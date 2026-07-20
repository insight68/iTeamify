"use client";

import { use } from "react";
import { SupplyReconciliationDetailPage } from "@teamify/views/supply-reconciliation";

export default function Page({ params }: { params: Promise<{ resultId: string }> }) {
  const { resultId } = use(params);
  return <SupplyReconciliationDetailPage resultId={resultId} />;
}
