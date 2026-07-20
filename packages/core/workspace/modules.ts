export type WorkspaceModuleKey =
  | "issues"
  | "projects"
  | "reconciliation"
  | "supplyReconciliation"
  | "inventory"
  | "productCategories";

export const WORKSPACE_MODULE_KEYS: readonly WorkspaceModuleKey[] = [
  "issues",
  "projects",
  "reconciliation",
  "supplyReconciliation",
  "inventory",
  "productCategories",
];

export const WORKSPACE_MODULE_NAV_DEFAULTS: Record<WorkspaceModuleKey, boolean> = {
  issues: true,
  projects: true,
  reconciliation: false,
  supplyReconciliation: false,
  inventory: false,
  productCategories: false,
};

type JsonRecord = Record<string, unknown>;
type WorkspaceModuleVisibilityMap = Record<WorkspaceModuleKey, boolean>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getModulesSettings(settings: unknown): JsonRecord {
  if (!isRecord(settings)) return {};
  return isRecord(settings.modules) ? settings.modules : {};
}

function getModuleSettings(settings: unknown, key: WorkspaceModuleKey): JsonRecord {
  const modules = getModulesSettings(settings);
  return isRecord(modules[key]) ? modules[key] : {};
}

function getLegacyReconciliationSettings(settings: unknown): JsonRecord {
  if (!isRecord(settings)) return {};
  return isRecord(settings.reconciliation) ? settings.reconciliation : {};
}

export function isWorkspaceModuleNavVisible(
  settings: unknown,
  key: WorkspaceModuleKey,
): boolean {
  const moduleSettings = getModuleSettings(settings, key);
  if (typeof moduleSettings.nav_visible === "boolean") {
    return moduleSettings.nav_visible;
  }

  if (key === "reconciliation") {
    const legacySettings = getLegacyReconciliationSettings(settings);
    if (typeof legacySettings.nav_visible === "boolean") {
      return legacySettings.nav_visible;
    }
  }

  return WORKSPACE_MODULE_NAV_DEFAULTS[key];
}

export function getWorkspaceModuleNavVisibility(
  settings: unknown,
): WorkspaceModuleVisibilityMap {
  return {
    issues: isWorkspaceModuleNavVisible(settings, "issues"),
    projects: isWorkspaceModuleNavVisible(settings, "projects"),
    reconciliation: isWorkspaceModuleNavVisible(settings, "reconciliation"),
    supplyReconciliation: isWorkspaceModuleNavVisible(settings, "supplyReconciliation"),
    inventory: isWorkspaceModuleNavVisible(settings, "inventory"),
    productCategories: isWorkspaceModuleNavVisible(settings, "productCategories"),
  };
}

export function withWorkspaceModuleNavVisibility(
  settings: unknown,
  key: WorkspaceModuleKey,
  navVisible: boolean,
): JsonRecord {
  const root = isRecord(settings) ? settings : {};
  const modules = getModulesSettings(root);
  const moduleSettings = getModuleSettings(root, key);

  return {
    ...root,
    modules: {
      ...modules,
      [key]: {
        ...moduleSettings,
        nav_visible: navVisible,
      },
    },
  };
}

export function withWorkspaceModuleNavVisibilityMap(
  settings: unknown,
  visibility: WorkspaceModuleVisibilityMap,
): JsonRecord {
  return WORKSPACE_MODULE_KEYS.reduce(
    (next, key) => withWorkspaceModuleNavVisibility(next, key, visibility[key]),
    isRecord(settings) ? settings : {},
  );
}
