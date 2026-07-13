import { describe, expect, it } from "vitest";
import {
  getWorkspaceModuleNavVisibility,
  isWorkspaceModuleNavVisible,
  withWorkspaceModuleNavVisibility,
  withWorkspaceModuleNavVisibilityMap,
} from "./modules";

describe("workspace module navigation settings", () => {
  it("uses product defaults for missing or malformed settings", () => {
    expect(getWorkspaceModuleNavVisibility(undefined)).toEqual({
      issues: true,
      projects: true,
      reconciliation: false,
      inventory: false,
    });
    expect(getWorkspaceModuleNavVisibility(null)).toEqual({
      issues: true,
      projects: true,
      reconciliation: false,
      inventory: false,
    });
    expect(getWorkspaceModuleNavVisibility({ modules: "bad" })).toEqual({
      issues: true,
      projects: true,
      reconciliation: false,
      inventory: false,
    });
    expect(
      isWorkspaceModuleNavVisible(
        { modules: { issues: { nav_visible: "yes" } } },
        "issues",
      ),
    ).toBe(true);
  });

  it("reads explicit module visibility", () => {
    const settings = {
      modules: {
        issues: { nav_visible: false },
        projects: { nav_visible: false },
        reconciliation: { nav_visible: true },
        inventory: { nav_visible: true },
      },
    };

    expect(getWorkspaceModuleNavVisibility(settings)).toEqual({
      issues: false,
      projects: false,
      reconciliation: true,
      inventory: true,
    });
  });

  it("falls back to the legacy reconciliation setting only when module setting is absent", () => {
    expect(
      isWorkspaceModuleNavVisible(
        { reconciliation: { nav_visible: true } },
        "reconciliation",
      ),
    ).toBe(true);
    expect(
      isWorkspaceModuleNavVisible(
        {
          modules: { reconciliation: { nav_visible: false } },
          reconciliation: { nav_visible: true },
        },
        "reconciliation",
      ),
    ).toBe(false);
  });

  it("sets one module without mutating or dropping other settings", () => {
    const settings = {
      theme: "quiet",
      modules: {
        issues: { nav_visible: true, badge: "count" },
      },
      reconciliation: {
        default_filter: { platform: "shop" },
      },
    };

    const next = withWorkspaceModuleNavVisibility(settings, "issues", false);

    expect(next).toEqual({
      theme: "quiet",
      modules: {
        issues: { nav_visible: false, badge: "count" },
      },
      reconciliation: {
        default_filter: { platform: "shop" },
      },
    });
    expect(settings.modules.issues.nav_visible).toBe(true);
  });

  it("sets the full module visibility map without dropping unrelated module keys", () => {
    const next = withWorkspaceModuleNavVisibilityMap(
      {
        modules: {
          custom: { nav_visible: true },
          projects: { default_view: "list" },
        },
      },
      { issues: false, projects: true, reconciliation: true, inventory: false },
    );

    expect(next).toEqual({
      modules: {
        custom: { nav_visible: true },
        issues: { nav_visible: false },
        projects: { default_view: "list", nav_visible: true },
        reconciliation: { nav_visible: true },
        inventory: { nav_visible: false },
      },
    });
  });
});
