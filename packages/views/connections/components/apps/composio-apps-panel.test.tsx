import { describe, it, expect, beforeEach, vi } from "vitest";
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@iteamify/core/i18n/react";
import enCommon from "../../../locales/en/common.json";
import enConnections from "../../../locales/en/connections.json";
import enSettings from "../../../locales/en/settings.json";
import type { ComposioConnection, ComposioToolkit } from "@iteamify/core/types";

// --- Mutable refs the mocked hooks read from, so each test can shape the data
// without re-mocking the modules. ---
const toolkitsRef = vi.hoisted(() => ({
  current: { data: [] as ComposioToolkit[], isLoading: false, isError: false },
}));
const connectionsRef = vi.hoisted(() => ({
  current: { data: [] as ComposioConnection[], isError: false },
}));
const searchParamsRef = vi.hoisted(() => ({ current: new URLSearchParams("view=apps") }));

const mockInvalidate = vi.hoisted(() => vi.fn());
const mockReplace = vi.hoisted(() => vi.fn());
const mockToastSuccess = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());
const mockBeginConnect = vi.hoisted(() => vi.fn());
const mockDeleteConnection = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = JSON.stringify(opts.queryKey);
    if (key.includes("toolkits")) return toolkitsRef.current;
    if (key.includes("connections")) return connectionsRef.current;
    return { data: undefined };
  },
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
  queryOptions: <T,>(opts: T) => opts,
}));

vi.mock("@iteamify/core/composio", () => ({
  composioKeys: {
    all: ["composio"],
    toolkits: () => ["composio", "toolkits"],
    connections: () => ["composio", "connections"],
  },
  composioToolkitsOptions: () => ({ queryKey: ["composio", "toolkits"], queryFn: vi.fn() }),
  composioConnectionsOptions: () => ({ queryKey: ["composio", "connections"], queryFn: vi.fn() }),
  useBeginComposioConnect: () => ({ mutateAsync: mockBeginConnect, isPending: false }),
  useDeleteComposioConnection: () => ({ mutateAsync: mockDeleteConnection, isPending: false }),
}));

vi.mock("@iteamify/core/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    beginComposioConnect: vi.fn(),
    deleteComposioConnection: vi.fn(),
  },
}));

vi.mock("../../../navigation", () => ({
  useNavigation: () => ({
    push: vi.fn(),
    replace: mockReplace,
    back: vi.fn(),
    pathname: "/acme/connections",
    searchParams: searchParamsRef.current,
    getShareableUrl: (p: string) => `https://app.example${p}`,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

import { ComposioAppsPanel } from "./composio-apps-panel";

function renderTab(showFullCatalog = true) {
  return render(
    <I18nProvider locale="en" resources={{ en: { common: enCommon, connections: enConnections, settings: enSettings } }}>
      <ComposioAppsPanel showFullCatalog={showFullCatalog} />
    </I18nProvider>,
  );
}

// StrictMode reproduces React's dev-mode mount → cleanup → mount double-invoke,
// which is exactly what would double-fire the callback toast without the
// consumed-key ref guard.
function renderTabStrict() {
  return render(
    <StrictMode>
      <I18nProvider locale="en" resources={{ en: { common: enCommon, connections: enConnections, settings: enSettings } }}>
        <ComposioAppsPanel showFullCatalog />
      </I18nProvider>
    </StrictMode>,
  );
}

const NOTION: ComposioToolkit = {
  slug: "notion",
  name: "Notion",
  connectable: true,
};

const GMAIL: ComposioToolkit = {
  slug: "gmail",
  name: "Gmail",
  connectable: true,
};

const OUTLOOK: ComposioToolkit = {
  slug: "outlook",
  name: "Microsoft Outlook",
  connectable: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  toolkitsRef.current = { data: [NOTION], isLoading: false, isError: false };
  connectionsRef.current = { data: [], isError: false };
  searchParamsRef.current = new URLSearchParams("view=apps");
});

describe("ComposioAppsPanel", () => {
  it("keeps Gmail native-owned and exposes Outlook as the simple long-tail email option", () => {
    toolkitsRef.current = {
      data: [NOTION, GMAIL, OUTLOOK],
      isLoading: false,
      isError: false,
    };

    renderTab(false);

    expect(screen.queryByText("Gmail")).not.toBeInTheDocument();
    expect(screen.getByText("Microsoft Outlook")).toBeInTheDocument();
    expect(screen.queryByText("Notion")).not.toBeInTheDocument();
    expect(
      screen.getByText(enConnections.apps.easy_connect_title),
    ).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("renders a connected card with a 'never used' placeholder when last_used_at is null", () => {
    connectionsRef.current = {
      data: [
        {
          id: "conn-1",
          toolkit_slug: "notion",
          status: "active",
          connected_at: "2026-06-01T00:00:00Z",
          last_used_at: null,
        },
      ],
      isError: false,
    };
    renderTab();
    expect(screen.getByText(enConnections.composio.connected)).toBeInTheDocument();
    expect(screen.getByText(enConnections.composio.last_used_never)).toBeInTheDocument();
  });

  it("keeps an existing legacy Gmail grant visible for disconnect without offering a new connection", () => {
    toolkitsRef.current = { data: [GMAIL], isLoading: false, isError: false };
    connectionsRef.current = {
      data: [{
        id: "gmail-legacy",
        toolkit_slug: "gmail",
        status: "active",
        connected_at: "2026-06-01T00:00:00Z",
        last_used_at: null,
      }],
      isError: false,
    };

    renderTab(false);

    expect(screen.getByText("Gmail")).toBeInTheDocument();
    expect(screen.getByText(enConnections.composio.legacy_connection)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: enConnections.composio.connect })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect Gmail" })).toBeInTheDocument();
  });

  it("renders a 'Last used' line when last_used_at is present", () => {
    connectionsRef.current = {
      data: [
        {
          id: "conn-1",
          toolkit_slug: "notion",
          status: "active",
          connected_at: "2026-06-01T00:00:00Z",
          last_used_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        },
      ],
      isError: false,
    };
    renderTab();
    // "Last used {{when}}" → relative time formatter yields "2m ago"
    expect(screen.getByText(/Last used/)).toBeInTheDocument();
    expect(screen.queryByText(enConnections.composio.last_used_never)).not.toBeInTheDocument();
  });

  it("renders the expired branch with a Reconnect button", () => {
    connectionsRef.current = {
      data: [
        {
          id: "conn-1",
          toolkit_slug: "notion",
          status: "expired",
          connected_at: "2026-06-01T00:00:00Z",
          last_used_at: null,
        },
      ],
      isError: false,
    };
    renderTab();
    expect(screen.getByText(enConnections.composio.expired)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: new RegExp(enConnections.composio.reconnect) }),
    ).toBeInTheDocument();
    // Not treated as connected, so no Connected badge.
    expect(screen.queryByText(enConnections.composio.connected)).not.toBeInTheDocument();
  });

  it("toasts success and clears the ?connected param on a successful callback", async () => {
    searchParamsRef.current = new URLSearchParams("view=apps&connected=notion");
    renderTab();
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(enConnections.composio.toast_connected);
    });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["composio", "connections"] });
    expect(mockReplace).toHaveBeenCalledWith("/acme/connections");
  });

  it("toasts error on a failed callback", async () => {
    searchParamsRef.current = new URLSearchParams("view=apps&error=composio_connect_failed");
    renderTab();
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(enConnections.composio.toast_connect_failed);
    });
    expect(mockReplace).toHaveBeenCalledWith("/acme/connections");
  });

  it("fires the success callback exactly once under StrictMode double-invoke", async () => {
    searchParamsRef.current = new URLSearchParams("view=apps&connected=notion");
    renderTabStrict();
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalled();
    });
    // The consumed-key ref must suppress the second (cleanup → re-mount) run.
    expect(mockToastSuccess).toHaveBeenCalledTimes(1);
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });
});
