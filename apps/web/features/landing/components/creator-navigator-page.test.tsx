import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreatorNavigatorPage } from "./creator-navigator-page";

vi.mock("./landing-header", () => ({
  LandingHeader: () => <div data-testid="landing-header" />,
}));

vi.mock("./landing-footer", () => ({
  LandingFooter: () => <div data-testid="landing-footer" />,
}));

const session = { isAuthenticated: false, ctaHref: "/login" };
const platforms = [
  "Fiverr",
  "Upwork",
  "Freelancer",
  "italki",
  "Preply",
  "Voquent",
  "Voices",
  "Gumroad",
  "Payhip",
  "Etsy",
  "Creative Market",
  "Canva Creators",
  "Udemy",
  "Skillshare",
  "YouTube",
  "TikTok",
] as const;

const platformHrefs = {
  Fiverr: "https://www.fiverr.com/",
  Upwork: "https://www.upwork.com/",
  Freelancer: "https://www.freelancer.com/",
  italki: "https://www.italki.com/",
  Preply: "https://preply.com/",
  Voquent: "https://www.voquent.com/",
  Voices: "https://www.voices.com/",
  Gumroad: "https://gumroad.com/",
  Payhip: "https://payhip.com/",
  Etsy: "https://www.etsy.com/",
  "Creative Market": "https://creativemarket.com/",
  "Canva Creators": "https://www.canva.com/creators/",
  Udemy: "https://www.udemy.com/",
  Skillshare: "https://www.skillshare.com/",
  YouTube: "https://www.youtube.com/",
  TikTok: "https://www.tiktok.com/",
} as const;

const chinaServiceExportTools = [
  "Google Trends",
  "Google Keyword Planner",
  "Similarweb",
  "Semrush",
  "Behance",
  "Dribbble",
  "GitHub",
  "Framer",
  "DeepL",
  "Grammarly",
  "LanguageTool",
  "Lokalise",
  "Tally",
  "Calendly",
  "Zoom",
  "Slack",
  "PandaDoc",
  "Docusign",
  "Dropbox Sign",
  "Bonsai",
  "Payoneer 派安盈",
  "PingPong 福贸",
  "LianLian Global",
  "Airwallex 空中云汇",
  "Notion",
  "Trello",
  "Frame.io",
  "Dropbox",
  "Zoho Invoice",
  "Xero",
  "QuickBooks",
  "FreshBooks",
  "国家税务总局",
  "国家外汇管理局",
  "中国服务贸易指南网",
  "服务贸易统计监测企业端",
] as const;

describe("CreatorNavigatorPage", () => {
  it("renders the mainland-China journey with every fixed platform", () => {
    render(<CreatorNavigatorPage locale="zh-Hans" session={session} />);

    expect(
      screen.getByRole("heading", {
        name: "你的技能、品位、审美、能力与手艺，值得更大的市场。",
      }),
    ).toBeInTheDocument();
    for (const noun of ["技能", "品位", "审美", "能力", "手艺"]) {
      expect(screen.getByText(noun)).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "专业服务接单" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "语言、教学与声音" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "数字产品与设计素材" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "录播课程" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "内容与长期受众" })).toBeInTheDocument();

    for (const platform of platforms) {
      const heading = screen.getByRole("heading", { name: platform });
      expect(heading).toBeInTheDocument();
      expect(heading.closest("a")).toHaveAttribute("href", platformHrefs[platform]);
      expect(heading.closest("a")).toHaveAttribute("target", "_blank");
      expect(heading.closest("a")).toHaveAttribute("rel", "noreferrer");
    }
    expect(
      screen.getByRole("heading", {
        name: "从找到需求，到合规收款，把经营链路补完整。",
      }),
    ).toBeInTheDocument();
    for (const tool of chinaServiceExportTools) {
      expect(screen.getByText(tool, { exact: true }).closest("a")).toBeInTheDocument();
    }
    expect(
      screen.getByRole("link", { name: /LianLian Global/ }),
    ).toHaveAttribute(
      "href",
      "https://global.lianlianpay.com/products/receiving",
    );
    expect(screen.getAllByRole("link", { name: /iteamify/ }).length).toBeGreaterThan(1);
    expect(screen.getByTestId("landing-header")).toBeInTheDocument();
    expect(screen.getByTestId("landing-footer")).toBeInTheDocument();
  });

  it("uses a different growth-constraint journey for English creators", () => {
    render(<CreatorNavigatorPage locale="en" session={session} />);

    expect(
      screen.getByRole("heading", { name: "Make your work easier to buy." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Win better client work" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Teach live before scaling" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Productize what repeats" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Build a durable audience asset" })).toBeInTheDocument();
    expect(screen.queryByText("专业服务接单")).not.toBeInTheDocument();

    for (const platform of platforms) {
      const heading = screen.getByRole("heading", { name: platform });
      expect(heading).toBeInTheDocument();
      expect(heading.closest("a")).toHaveAttribute("href", platformHrefs[platform]);
      expect(heading.closest("a")).toHaveAttribute("target", "_blank");
      expect(heading.closest("a")).toHaveAttribute("rel", "noreferrer");
    }
    expect(screen.queryByText("中国服务出海工具箱")).not.toBeInTheDocument();
  });
});
