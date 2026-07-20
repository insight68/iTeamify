import { useParams } from "react-router-dom";
import { SupplyReconciliationDetailPage as SharedSupplyReconciliationDetailPage } from "@teamify/views/supply-reconciliation";

export function SupplyReconciliationDetailPage() {
  const { resultId = "" } = useParams<{ resultId: string }>();
  return <SharedSupplyReconciliationDetailPage resultId={resultId} />;
}
