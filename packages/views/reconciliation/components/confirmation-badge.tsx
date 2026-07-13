"use client";

import { CheckCircle2, Lock, Clock } from "lucide-react";
import { Badge } from "@teamify/ui/components/ui/badge";
import { useT } from "../../i18n";

interface ConfirmStatusProps {
  confirmed?: boolean;
  locked?: boolean;
}

/**
 * Visual indicator of a row's confirmation status in the summary table.
 */
export function ConfirmationBadge({ confirmed, locked }: ConfirmStatusProps) {
  const { t } = useT("agents");

  if (confirmed && !locked) {
    return (
      <Badge variant="default" className="text-xs font-medium">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        {t(($) => $.tab_body.reconciliation.status_confirmed)}
      </Badge>
    );
  }
  if (confirmed && locked) {
    return (
      <Badge variant="secondary" className="text-xs font-medium">
        <Lock className="h-3 w-3 mr-1" />
        {t(($) => $.tab_body.reconciliation.status_locked)}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">
      <Clock className="h-3 w-3 mr-1" />
      {t(($) => $.tab_body.reconciliation.status_pending)}
    </Badge>
  );
}
