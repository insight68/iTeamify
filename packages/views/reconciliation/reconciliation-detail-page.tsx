"use client";

import { useWorkspacePaths } from "@teamify/core/paths";
import { useNavigation } from "../navigation";
import { ReconciliationDetailView } from "./reconciliation-detail-view";

interface ReconciliationDetailPageProps {
  batchNo: string;
}

/**
 * Standalone reconciliation detail route.
 *
 * Query and rendering behavior is shared with the embedded reconciliation
 * module through ReconciliationDetailView.
 */
export function ReconciliationDetailPage({ batchNo }: ReconciliationDetailPageProps) {
  const wsPaths = useWorkspacePaths();
  const navigation = useNavigation();

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col p-4">
      <ReconciliationDetailView
        batchNo={batchNo}
        onBack={() => navigation.push(wsPaths.reconciliation())}
        backLabel="对账"
      />
    </div>
  );
}
