"use client";

import type * as React from "react";
import type { ReconciliationConfig } from "@teamify/core/types";
import { ReconciliationExperience } from "../../reconciliation";

interface AgentReconciliationPanelProps {
  config: ReconciliationConfig;
  fullscreenControl?: React.ReactNode;
}

/**
 * Chat-hosted reconciliation module.
 *
 * This component deliberately stays thin: the standalone /reconciliation
 * route owns the actual content and business logic through
 * ReconciliationExperience. Agent config only decides whether the module is
 * mounted in chat and can optionally override the title.
 */
export function AgentReconciliationPanel({
  config,
  fullscreenControl,
}: AgentReconciliationPanelProps) {
  if (!config.enabled) return null;

  return (
    <ReconciliationExperience
      surface="embedded"
      detailMode="inline"
      titleOverride={config.title || undefined}
      headerAction={fullscreenControl}
    />
  );
}
