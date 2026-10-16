import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { getShortcutPlatform } from "@iteamify/core/shortcuts";
import { renderWithI18n } from "../test/i18n";
import { GlobalShortcuts } from "../layout/global-shortcuts";
import { DeferredSearchCommand } from "./deferred-search-command";
import { useSearchStore } from "./search-store";

vi.mock("@iteamify/ui/components/ui/sidebar", () => ({ useSidebar: () => ({ toggleSidebar: () => {} }) }));
vi.mock("@iteamify/core/paths", () => ({ useWorkspacePaths: () => new Proxy({}, { get: (_, key) => () => `/w/${String(key)}` }) }));
vi.mock("../navigation", () => ({ useNavigation: () => ({ pathname: "/w/issues", push: () => {} }) }));
vi.mock("./search-command", async () => {
  const { useSearchStore } = await import("./search-store");
  return { SearchCommand: () => useSearchStore((s) => s.open) ? <div>Search ready</div> : null };
});

it("opens with the very first global shortcut while the search module is still cold", async () => {
  useSearchStore.getState().setOpen(false);
  renderWithI18n(<><GlobalShortcuts /><DeferredSearchCommand /></>);
  expect(screen.queryByText("Search ready")).toBeNull();
  fireEvent.keyDown(document, { key: "k", metaKey: getShortcutPlatform() === "macos", ctrlKey: getShortcutPlatform() !== "macos" });
  expect(await screen.findByText("Search ready")).toBeInTheDocument();
  act(() => useSearchStore.getState().setOpen(false));
  expect(screen.queryByText("Search ready")).toBeNull();
});
