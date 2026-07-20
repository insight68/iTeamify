"use client";

import { ReconciliationExperience } from "./reconciliation-experience";

/**
 * Standalone workspace reconciliation route.
 *
 * The route is intentionally a thin host. All page content and business
 * behavior lives in ReconciliationExperience so embedded modules reuse the
 * same implementation.
 */
export function ReconciliationPage() {
  return <ReconciliationExperience surface="route" detailMode="route" />;
}
