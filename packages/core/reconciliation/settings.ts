import {
  isWorkspaceModuleNavVisible,
  withWorkspaceModuleNavVisibility,
} from "../workspace/modules";

export function isReconciliationNavVisible(settings: unknown): boolean {
  return isWorkspaceModuleNavVisible(settings, "reconciliation");
}

export function withReconciliationNavVisible(
  settings: unknown,
  navVisible: boolean,
): Record<string, unknown> {
  return withWorkspaceModuleNavVisibility(
    settings,
    "reconciliation",
    navVisible,
  );
}
