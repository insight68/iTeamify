"use client";

import { use } from "react";
import { ReconciliationDetailPage } from "@teamify/views/reconciliation";

export default function Page({ params }: { params: Promise<{ batchNo: string }> }) {
  const { batchNo } = use(params);
  return <ReconciliationDetailPage batchNo={batchNo} />;
}
