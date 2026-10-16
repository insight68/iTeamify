import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentRuntime } from "@iteamify/core/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@iteamify/core/i18n/react";
import enCommon from "../../locales/en/common.json";
import enOnboarding from "../../locales/en/onboarding.json";

const TEST_RESOURCES = { en: { common: enCommon, onboarding: enOnboarding } };

const mocks = vi.hoisted(() => ({
  pickerState: {
    runtimes: [] as AgentRuntime[],
    selected: null as AgentRuntime | null,
    selectedId: null as string | null,
    setSelectedId: vi.fn<(id: string) => void>(),
    hasRuntimes: false,
  },
}));

// Swap out the runtime picker so tests can drive runtimes / selection
// without a real TanStack Query + WS stack.
vi.mock("../components/use-runtime-picker", () => ({
  useRuntimePicker: () => mocks.pickerState,
}));

import { StepPlatformFork } from "./step-platform-fork";

function makeRuntime(overrides: Partial<AgentRuntime> = {}): AgentRuntime {
  return {
    id: "rt_test",
    workspace_id: "ws_test",
    name: "Claude Code",
    provider: "claude",
    status: "online",
    runtime_mode: "local",
    runtime_config: {},
    device_info: "",
    metadata: {},
    daemon_id: null,
    last_seen_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as unknown as AgentRuntime;
}

function renderFork(
  overrides: Partial<React.ComponentProps<typeof StepPlatformFork>> = {},
) {
  const onNext = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><I18nProvider locale="en" resources={TEST_RESOURCES}>
      <StepPlatformFork
        wsId="ws_test"
        onNext={onNext}
        cliInstructions={<div data-testid="cli-instructions">install me</div>}
        {...overrides}
      />
    </I18nProvider></QueryClientProvider>,
  );
  return { onNext };
}

function resetPicker(patch: Partial<typeof mocks.pickerState> = {}) {
  mocks.pickerState.runtimes = patch.runtimes ?? [];
  mocks.pickerState.selected = patch.selected ?? null;
  mocks.pickerState.selectedId = patch.selectedId ?? null;
  mocks.pickerState.hasRuntimes = patch.hasRuntimes ?? false;
  mocks.pickerState.setSelectedId = vi.fn();
}

describe("StepPlatformFork", () => {
  beforeEach(() => { resetPicker(); vi.restoreAllMocks(); });

  it("offers desktop installation and an expandable terminal connection", async () => {
    renderFork();
    expect(screen.getByText(/^use this computer$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^use a cloud computer$/i)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByText("Other connection methods"));
    expect(screen.getByRole("button", { name: /show steps/i })).toBeVisible();
  });

  it("allows entering the workspace before connecting", async () => {
    const { onNext } = renderFork();
    await userEvent.setup().click(screen.getByRole("button", { name: /enter the workspace first/i }));
    expect(onNext).toHaveBeenCalledWith(null);
  });

  it("disables the exit while its request is pending", () => {
    renderFork({ pending: true });
    expect(screen.getByRole("button", { name: /enter the workspace first/i })).toBeDisabled();
  });

  it("explains where to continue after opening the download page", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderFork();
    await userEvent.setup().click(screen.getByText(/^use this computer$/i));
    expect(open).toHaveBeenCalledWith("https://github.com/iteamify-ai/iteamify/releases", "_blank", "noopener,noreferrer");
    expect(screen.getAllByText(/sign in with the same account/i).length).toBeGreaterThan(0);
  });

  it("shows terminal instructions while waiting for a connection", async () => {
    renderFork();
    const user = userEvent.setup();
    await user.click(screen.getByText("Other connection methods"));
    await user.click(screen.getByRole("button", { name: /show steps/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("cli-instructions")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^continue$/i })).toBeDisabled();
  });

  it("uses a detected online runtime without another installation choice", async () => {
    const runtime = makeRuntime();
    resetPicker({ runtimes: [runtime], selected: runtime, selectedId: runtime.id, hasRuntimes: true });
    const { onNext } = renderFork();
    expect(screen.queryByText(/^use this computer$/i)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /^continue$/i }));
    expect(onNext).toHaveBeenCalledWith(runtime);
  });
});
