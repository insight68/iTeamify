// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nProvider } from "@iteamify/core/i18n/react";
import enAgents from "../../locales/en/agents.json";
import enCommon from "../../locales/en/common.json";
import enIssues from "../../locales/en/issues.json";

const mockInitiateListModels = vi.hoisted(() => vi.fn());
const mockGetListModelsResult = vi.hoisted(() => vi.fn());

vi.mock("@iteamify/core/api", () => ({
  api: {
    withRequestContext() { return this; },
    initiateListModels: (...args: unknown[]) => mockInitiateListModels(...args),
    getListModelsResult: (...args: unknown[]) =>
      mockGetListModelsResult(...args),
  },
  ApiError: class ApiError extends Error {},
}));

import { ModelDropdown } from "./model-dropdown";

describe("ModelDropdown platform catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitiateListModels.mockResolvedValue({
      id: "control-plane-result",
      runtime_id: "openagent-runtime",
      status: "completed",
      models: [
        {
          id: "platform-model-v1",
          label: "Platform Model V1",
          provider: "openagent",
          default: true,
        },
      ],
      supported: true,
      selection_mode: "fixed",
      created_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    });
  });

  afterEach(() => cleanup());

  it("renders a fixed model without exposing discovery or custom input", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <I18nProvider
        locale="en"
        resources={{
          en: { common: enCommon, agents: enAgents, issues: enIssues },
        }}
      >
        <QueryClientProvider client={queryClient}>
          <ModelDropdown
            runtimeId="openagent-runtime"
            runtimeOnline
            value=""
            onChange={vi.fn()}
          />
        </QueryClientProvider>
      </I18nProvider>,
    );

    expect(await screen.findByText("Platform Model V1")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/discovery failed/i)).toBeNull();
    expect(mockInitiateListModels).toHaveBeenCalledWith("openagent-runtime");
  });
});
