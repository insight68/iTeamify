import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentReconciliationPanel } from "./agent-reconciliation-panel";
import type { ReconciliationConfig } from "@teamify/core/types";

const { experienceSpy } = vi.hoisted(() => ({
  experienceSpy: vi.fn(),
}));

vi.mock("../../reconciliation", () => ({
  ReconciliationExperience: (props: Record<string, unknown>) => {
    experienceSpy(props);
    return <div data-testid="reconciliation-experience" />;
  },
}));

const enabledConfig: ReconciliationConfig = {
  enabled: true,
  title: "Agent 对账",
  batch_no_column: "batch_no",
  confirmable: true,
  columns: [],
  filters: [],
  page_size: 20,
};

describe("AgentReconciliationPanel", () => {
  beforeEach(() => {
    experienceSpy.mockClear();
  });

  it("delegates enabled chat module rendering to the shared reconciliation experience", () => {
    render(
      <AgentReconciliationPanel
        config={enabledConfig}
        fullscreenControl={<button type="button">Fullscreen</button>}
      />,
    );

    expect(screen.getByTestId("reconciliation-experience")).toBeInTheDocument();
    expect(experienceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "embedded",
        detailMode: "inline",
        titleOverride: "Agent 对账",
        headerAction: expect.anything(),
      }),
    );
  });

  it("does not mount the shared experience when the agent module is disabled", () => {
    const { container } = render(
      <AgentReconciliationPanel
        config={{ ...enabledConfig, enabled: false }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(experienceSpy).not.toHaveBeenCalled();
  });
});
