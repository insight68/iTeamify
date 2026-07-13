import { useParams } from "react-router-dom";
import { ReconciliationDetailPage as SharedReconciliationDetailPage } from "@teamify/views/reconciliation";
import { useDocumentTitle } from "@/hooks/use-document-title";

export function ReconciliationDetailPage() {
  const { batchNo } = useParams<{ batchNo: string }>();

  useDocumentTitle(batchNo ? `Reconciliation ${batchNo}` : "Reconciliation");

  if (!batchNo) return null;
  return <SharedReconciliationDetailPage batchNo={batchNo} />;
}
