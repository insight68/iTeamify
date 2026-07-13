import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n } from "../test/i18n";
import { IntegrationsSection } from "./integrations-section";

describe("IntegrationsSection", () => {
  it("shows supported business systems and the agent connection layer", () => {
    renderWithI18n(<IntegrationsSection />, { locale: "zh-Hans" });

    const section = screen.getByRole("region", {
      name: /连接现有系统，让智能体直接参与经营/,
    });

    for (const system of [
      "金蝶",
      "旺店通",
      "用友",
      "聚水潭",
      "淘宝/天猫",
      "抖音电商",
      "Excel",
      "钉钉",
    ]) {
      expect(within(section).getByText(system)).toBeInTheDocument();
    }

    expect(within(section).getByText(/六个智能体共享经营上下文/)).toBeInTheDocument();
    expect(within(section).getByText("合规审计")).toBeInTheDocument();
  });
});
