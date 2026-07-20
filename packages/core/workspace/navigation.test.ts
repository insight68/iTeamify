import { describe, expect, it } from "vitest";
import {
  getWorkspaceShortcutNavVisibility,
  isWorkspaceShortcutNavVisible,
  withWorkspaceShortcutNavVisibility,
  withWorkspaceShortcutNavVisibilityMap,
} from "./navigation";

describe("workspace shortcut navigation settings", () => {
  it("uses product defaults for missing or malformed settings", () => {
    expect(getWorkspaceShortcutNavVisibility(undefined)).toEqual({
      inbox: true,
      myIssues: false,
      createIssue: false,
      search: false,
    });
    expect(getWorkspaceShortcutNavVisibility({ navigation: "bad" })).toEqual({
      inbox: true,
      myIssues: false,
      createIssue: false,
      search: false,
    });
    expect(
      isWorkspaceShortcutNavVisible(
        { navigation: { sidebar: { inbox: { nav_visible: "yes" } } } },
        "inbox",
      ),
    ).toBe(true);
  });

  it("reads explicit shortcut visibility", () => {
    const settings = {
      navigation: {
        sidebar: {
          inbox: { nav_visible: false },
          myIssues: { nav_visible: true },
          createIssue: { nav_visible: true },
          search: { nav_visible: true },
        },
      },
    };

    expect(getWorkspaceShortcutNavVisibility(settings)).toEqual({
      inbox: false,
      myIssues: true,
      createIssue: true,
      search: true,
    });
  });

  it("sets one shortcut without mutating or dropping other navigation settings", () => {
    const settings = {
      theme: "quiet",
      navigation: {
        density: "compact",
        sidebar: {
          inbox: { unread_badge: true },
        },
      },
    };

    const next = withWorkspaceShortcutNavVisibility(settings, "inbox", false);

    expect(next).toEqual({
      theme: "quiet",
      navigation: {
        density: "compact",
        sidebar: {
          inbox: {
            unread_badge: true,
            nav_visible: false,
          },
        },
      },
    });
    expect(settings.navigation.sidebar.inbox).toEqual({ unread_badge: true });
  });

  it("sets the full shortcut visibility map", () => {
    const next = withWorkspaceShortcutNavVisibilityMap(
      {
        navigation: {
          sidebar: {
            custom: { nav_visible: true },
          },
        },
      },
      { inbox: true, myIssues: true, createIssue: false, search: false },
    );

    expect(next).toEqual({
      navigation: {
        sidebar: {
          custom: { nav_visible: true },
          inbox: { nav_visible: true },
          myIssues: { nav_visible: true },
          createIssue: { nav_visible: false },
          search: { nav_visible: false },
        },
      },
    });
  });
});
