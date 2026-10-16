import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@iteamify/core/i18n/react";
import enSettings from "../../locales/en/settings.json";
import enLayout from "../../locales/en/layout.json";
import {
  isSettingsTabVisibleInNavigation,
  resolveLegacyConnectionDestination,
  resolveSettingsTab,
  SettingsPage,
} from "./settings-page";

const navigation = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
}));

vi.mock("../../navigation", () => ({
  useNavigation: () => ({
    pathname: "/acme/settings",
    searchParams: new URLSearchParams(navigation.search),
    replace: navigation.replace,
  }),
}));

vi.mock("@iteamify/core/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@iteamify/core/paths")>()),
  useCurrentWorkspace: () => ({ name: "Acme" }),
  useWorkspacePaths: () => ({ connections: () => "/acme/connections" }),
}));

vi.mock("./openagent-tab", () => ({ OpenAgentTab: () => <div>OpenAgent configuration</div> }));
vi.mock("./account-tab", () => ({ AccountTab: () => <div>Account content</div> }));
vi.mock("../../agents/components/agents-page", () => ({
  AgentsPage: () => <div>Agent management content</div>,
}));

function renderSettings(props: Parameters<typeof SettingsPage>[0] = {}) {
  return render(
    <I18nProvider locale="en" resources={{ en: { settings: enSettings, layout: enLayout } }}>
      <SettingsPage {...props} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  navigation.search = "";
  navigation.replace.mockClear();
});

describe("settings navigation", () => {
  it.each(["tokens", "github", "repositories", "labs"])(
    "hides the %s tab entry",
    (tab) => {
      expect(isSettingsTabVisibleInNavigation(tab)).toBe(false);
    },
  );

  it.each(["profile", "preferences", "members"])(
    "keeps the %s tab entry visible",
    (tab) => {
      expect(isSettingsTabVisibleInNavigation(tab)).toBe(true);
    },
  );

  it("places Agents at the start of the second group", () => {
    renderSettings();
    const list = screen.getByRole("tablist");
    const workspaceHeading = screen.getByText("Acme");
    const agents = screen.getByRole("tab", { name: "Agents" });
    const openagent = screen.getByRole("tab", { name: "OpenAgent" });
    const members = screen.getByRole("tab", { name: "Members" });
    const children = Array.from(list.children);
    expect(children.indexOf(agents)).toBe(children.indexOf(workspaceHeading) + 1);
    expect(children.indexOf(openagent)).toBe(children.indexOf(agents) + 1);
    expect(children.indexOf(members)).toBe(children.indexOf(openagent) + 1);
    expect(screen.queryByText("Agent management content")).not.toBeInTheDocument();
  });

  it.each([
    ["agents", "Agents", "Agent management content"],
    ["openagent", "OpenAgent", "OpenAgent configuration"],
  ])("opens the %s settings deep link", async (tab, label, content) => {
    navigation.search = `tab=${tab}`;
    renderSettings();
    expect(await screen.findByText(content)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Account content")).not.toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it.each([
    ["agents", "Agents"],
  ])("switches to %s while preserving other query params", async (tab, label) => {
    navigation.search = "tab=profile&source=workspace";
    renderSettings();
    await userEvent.setup().click(screen.getByRole("tab", { name: label }));
    expect(navigation.replace).toHaveBeenCalledWith(`/acme/settings?tab=${tab}&source=workspace`);
  });

  it("uses the platform agent page when provided", () => {
    navigation.search = "tab=agents";
    renderSettings({ agentsContent: <div>Desktop agent content</div> });
    expect(screen.getByText("Desktop agent content")).toBeInTheDocument();
    expect(screen.queryByText("Agent management content")).not.toBeInTheDocument();
  });
});

describe("resolveSettingsTab", () => {
  const validTabs = new Set(["profile", "repositories"]);

  it("treats removed company and workspace tabs as invalid without redirecting", () => {
    expect(resolveSettingsTab("company", validTabs)).toBe("profile");
    expect(resolveSettingsTab("workspace", validTabs)).toBe("profile");
  });

  it("keeps current settings tabs working and rejects moved tabs", () => {
    expect(resolveSettingsTab("lark", validTabs)).toBe("profile");
    expect(resolveSettingsTab("integrations", validTabs)).toBe("profile");
    expect(resolveSettingsTab("repositories", validTabs)).toBe("repositories");
  });
});

describe("resolveLegacyConnectionDestination", () => {
  it("moves the integrations deep link to unified Connections and preserves callback params", () => {
    expect(
      resolveLegacyConnectionDestination(
        "integrations",
        "/acme/connections",
        new URLSearchParams("tab=integrations&connected=notion"),
      ),
    ).toBe("/acme/connections?connected=notion");
  });

  it("moves the legacy Lark deep link to the Feishu channel section", () => {
    expect(
      resolveLegacyConnectionDestination(
        "lark",
        "/acme/connections",
        new URLSearchParams("tab=lark"),
      ),
    ).toBe("/acme/connections#feishu");
  });

  it("ignores unrelated settings tabs", () => {
    expect(
      resolveLegacyConnectionDestination(
        "members",
        "/acme/connections",
        new URLSearchParams("tab=members"),
      ),
    ).toBeNull();
  });
});
