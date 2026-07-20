export type WorkspaceShortcutNavKey =
  | "inbox"
  | "myIssues"
  | "createIssue"
  | "search";

export const WORKSPACE_SHORTCUT_NAV_KEYS: readonly WorkspaceShortcutNavKey[] = [
  "inbox",
  "myIssues",
  "createIssue",
  "search",
];

export const WORKSPACE_SHORTCUT_NAV_DEFAULTS: Record<WorkspaceShortcutNavKey, boolean> = {
  inbox: true,
  myIssues: false,
  createIssue: false,
  search: false,
};

type JsonRecord = Record<string, unknown>;
type WorkspaceShortcutVisibilityMap = Record<WorkspaceShortcutNavKey, boolean>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getNavigationSettings(settings: unknown): JsonRecord {
  if (!isRecord(settings)) return {};
  return isRecord(settings.navigation) ? settings.navigation : {};
}

function getSidebarSettings(settings: unknown): JsonRecord {
  const navigation = getNavigationSettings(settings);
  return isRecord(navigation.sidebar) ? navigation.sidebar : {};
}

function getShortcutSettings(settings: unknown, key: WorkspaceShortcutNavKey): JsonRecord {
  const sidebar = getSidebarSettings(settings);
  return isRecord(sidebar[key]) ? sidebar[key] : {};
}

export function isWorkspaceShortcutNavVisible(
  settings: unknown,
  key: WorkspaceShortcutNavKey,
): boolean {
  const shortcut = getShortcutSettings(settings, key);
  return typeof shortcut.nav_visible === "boolean"
    ? shortcut.nav_visible
    : WORKSPACE_SHORTCUT_NAV_DEFAULTS[key];
}

export function getWorkspaceShortcutNavVisibility(
  settings: unknown,
): WorkspaceShortcutVisibilityMap {
  return {
    inbox: isWorkspaceShortcutNavVisible(settings, "inbox"),
    myIssues: isWorkspaceShortcutNavVisible(settings, "myIssues"),
    createIssue: isWorkspaceShortcutNavVisible(settings, "createIssue"),
    search: isWorkspaceShortcutNavVisible(settings, "search"),
  };
}

export function withWorkspaceShortcutNavVisibility(
  settings: unknown,
  key: WorkspaceShortcutNavKey,
  navVisible: boolean,
): JsonRecord {
  const root = isRecord(settings) ? settings : {};
  const navigation = getNavigationSettings(root);
  const sidebar = getSidebarSettings(root);
  const shortcut = getShortcutSettings(root, key);

  return {
    ...root,
    navigation: {
      ...navigation,
      sidebar: {
        ...sidebar,
        [key]: {
          ...shortcut,
          nav_visible: navVisible,
        },
      },
    },
  };
}

export function withWorkspaceShortcutNavVisibilityMap(
  settings: unknown,
  visibility: WorkspaceShortcutVisibilityMap,
): JsonRecord {
  return WORKSPACE_SHORTCUT_NAV_KEYS.reduce(
    (next, key) => withWorkspaceShortcutNavVisibility(next, key, visibility[key]),
    isRecord(settings) ? settings : {},
  );
}
