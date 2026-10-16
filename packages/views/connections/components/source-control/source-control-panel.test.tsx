// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@iteamify/core/i18n/react";
import enCommon from "../../../locales/en/common.json";
import enConnections from "../../../locales/en/connections.json";
import enSettings from "../../../locales/en/settings.json";

const listingRef = vi.hoisted(() => ({
  current: {
    connections: [] as Array<{
      id: string;
      workspace_id: string;
      provider: "forgejo" | "gitea" | "gitlab";
      instance_url: string;
      account_login: string;
      webhook_url: string;
      webhook_path: string;
      created_at: string;
    }>,
    configured: true,
    can_manage: true,
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: listingRef.current,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  queryOptions: <T,>(options: T) => options,
}));

vi.mock("@iteamify/core/hooks", () => ({ useWorkspaceId: () => "workspace-1" }));

vi.mock("@iteamify/core/vcs", () => ({
  vcsConnectionsOptions: () => ({ queryKey: ["vcs", "workspace-1", "connections"] }),
  useConnectVCS: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRotateVCSWebhook: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteVCSConnection: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

import { SourceControlPanel } from "./source-control-panel";

function renderPanel() {
  return render(
    <I18nProvider
      locale="en"
      resources={{
        en: {
          common: enCommon,
          connections: enConnections,
          settings: enSettings,
        },
      }}
    >
      <SourceControlPanel />
    </I18nProvider>,
  );
}

beforeEach(() => {
  listingRef.current = {
    connections: [],
    configured: true,
    can_manage: true,
  };
});

describe("SourceControlPanel", () => {
  it("shows the connect form in a dialog for workspace administrators", async () => {
    renderPanel();
    await userEvent.click(
      screen.getByRole("button", { name: enSettings.vcs.connect_title }),
    );

    expect(screen.getByLabelText(enSettings.vcs.form_instance_url_label)).toHaveAttribute(
      "type",
      "url",
    );
    expect(screen.getByLabelText(enSettings.vcs.form_token_label)).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("keeps existing connections visible but management actions hidden for members", () => {
    listingRef.current = {
      connections: [
        {
          id: "vcs-1",
          workspace_id: "workspace-1",
          provider: "forgejo",
          instance_url: "https://git.example.test",
          account_login: "octo",
          webhook_url: "https://app.example.test/api/webhook",
          webhook_path: "/api/webhook",
          created_at: "2026-08-15T00:00:00Z",
        },
      ],
      configured: true,
      can_manage: false,
    };

    renderPanel();
    expect(screen.getByText(/Forgejo · https:\/\/git\.example\.test/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: enSettings.vcs.disconnect })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: enSettings.vcs.connect_title })).not.toBeInTheDocument();
  });

  it("shows an operator-facing configuration state and disables connection creation", () => {
    listingRef.current = {
      connections: [],
      configured: false,
      can_manage: true,
    };

    renderPanel();
    expect(screen.getByText(enSettings.vcs.not_configured_title)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: enSettings.vcs.connect_title })).not.toBeInTheDocument();
  });
});
