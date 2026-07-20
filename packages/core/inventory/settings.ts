import { isWorkspaceModuleNavVisible, withWorkspaceModuleNavVisibility } from "../workspace/modules";

export const isInventoryNavVisible = (settings: unknown) =>
  isWorkspaceModuleNavVisible(settings, "inventory");

export const withInventoryNavVisible = (settings: unknown, visible: boolean) =>
  withWorkspaceModuleNavVisibility(settings, "inventory", visible);
