// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@iteamify/core/i18n/react";
import type { GmailConnection, ListGmailConnectionsResponse } from "@iteamify/core/types";
import enCommon from "../../../locales/en/common.json";
import enConnections from "../../../locales/en/connections.json";

const queryRef = vi.hoisted(() => ({
  current: {
    data: { configured: true, analysis_configured: true, connections: [] } as ListGmailConnectionsResponse,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));
const searchParamsRef = vi.hoisted(() => ({ current: new URLSearchParams() }));
const mockInvalidate = vi.hoisted(() => vi.fn());
const mockReplace = vi.hoisted(() => vi.fn());
const mockBegin = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());
const mockToastSuccess = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => queryRef.current,
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
  queryOptions: <T,>(options: T) => options,
}));

vi.mock("@iteamify/core/hooks", () => ({ useWorkspaceId: () => "workspace-1" }));

vi.mock("@iteamify/core/gmail", () => ({
  gmailKeys: {
    all: ["gmail"],
    connectionLists: () => ["gmail", "connections"],
    connections: (workspaceId: string) => ["gmail", "connections", workspaceId],
  },
  gmailConnectionsOptions: (workspaceId: string) => ({
    queryKey: ["gmail", "connections", workspaceId],
    queryFn: vi.fn(),
  }),
  useBeginGmailConnect: () => ({ mutateAsync: mockBegin, isPending: false }),
  useUpdateGmailAnalysis: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useDeleteGmailConnection: () => ({ mutateAsync: mockDelete, isPending: false }),
}));

vi.mock("../../../navigation", () => ({
  useNavigation: () => ({
    pathname: "/acme/connections",
    searchParams: searchParamsRef.current,
    replace: mockReplace,
    push: vi.fn(),
    back: vi.fn(),
    getShareableUrl: (path: string) => `https://app.example${path}`,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

import { GmailConnections } from "./gmail-connections";

const CONNECTED_ACCOUNT: GmailConnection = {
  id: "gmail-1",
  email_address: "owner@example.com",
  status: "active",
  analysis_enabled: true,
  message_count: 12,
  analyzed_count: 10,
  connected_at: "2026-08-15T00:00:00Z",
  last_sync_at: "2026-08-15T00:05:00Z",
};

function renderUI() {
  return render(
    <I18nProvider
      locale="en"
      resources={{ en: { common: enCommon, connections: enConnections } }}
    >
      <GmailConnections />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  queryRef.current = {
    data: { configured: true, analysis_configured: true, connections: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
  searchParamsRef.current = new URLSearchParams();
  mockBegin.mockResolvedValue({ redirect_url: "https://accounts.google.com/o/oauth2/v2/auth" });
  mockUpdate.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
});

describe("GmailConnections", () => {
  it("shows a scoped setup message instead of failing the whole Connections page", () => {
    queryRef.current.data = { configured: false, analysis_configured: false, connections: [] };
    renderUI();
    expect(screen.getByText(enConnections.gmail.not_configured)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: enConnections.gmail.connect })).not.toBeInTheDocument();
  });

  it("renders account health and updates workspace-scoped automatic analysis", async () => {
    queryRef.current.data = { configured: true, analysis_configured: true, connections: [CONNECTED_ACCOUNT] };
    renderUI();

    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("switch", {
        name: enConnections.gmail.analysis_toggle_aria.replace("{{email}}", "owner@example.com"),
      }),
    );
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ connectionId: "gmail-1", enabled: false }),
    );
  });

  it("consumes a Gmail callback once and removes the legacy view parameter", async () => {
    searchParamsRef.current = new URLSearchParams("view=apps&gmail_connected=gmail-1");
    renderUI();

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledTimes(1));
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["gmail", "connections"] });
    expect(mockReplace).toHaveBeenCalledWith("/acme/connections");
  });
});
