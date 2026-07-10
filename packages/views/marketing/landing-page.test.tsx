import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderWithI18n } from "../test/i18n";
import { LandingPage } from "./landing-page";

vi.mock("../navigation", () => ({
  AppLink: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useNavigation: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: "/",
    searchParams: new URLSearchParams(),
    getShareableUrl: (p: string) => p,
  }),
  NavigationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function renderPage(ui: ReactElement) {
  return renderWithI18n(ui);
}

describe("LandingPage", () => {
  it("renders the AI operating team positioning", () => {
    renderPage(<LandingPage />);
    expect(
      screen.getByRole("heading", { level: 1 }),
    ).toHaveTextContent(/your AI operating team/i);
    expect(screen.getAllByText(/AI operating team collaboration platform/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders the hero warehouse dashboard visual", () => {
    renderPage(<LandingPage />);
    expect(
      screen.getByAltText(/inventory operating dashboard in a warehouse/i),
    ).toBeInTheDocument();
  });

  it("links the hero customer stories CTA to #customers", () => {
    renderPage(<LandingPage />);
    expect(
      screen.getByRole("link", { name: /view customer stories/i }),
    ).toHaveAttribute("href", "#customers");
  });

  it("renders the 6 operating agent cards", async () => {
    renderPage(<LandingPage />);
    const section = await screen.findByRole("region", { name: /each agent owns one operating motion/i });
    for (const title of [
      "Reconciliation agent",
      "Procurement agent",
      "Inventory transfer agent",
      "Demand forecasting agent",
      "Operating analysis agent",
      "Compliance audit agent",
    ]) {
      expect(within(section).getAllByText(title).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders the operating loop from forecast to audit", async () => {
    renderPage(<LandingPage />);
    const section = await screen.findByRole("region", {
      name: /one closed loop from demand forecast to compliance audit/i,
    });

    for (const step of [
      "Forecast demand",
      "Plan purchasing",
      "Move inventory",
      "Reconcile cash",
      "Explain operations",
      "Audit compliance",
    ]) {
      expect(within(section).getByText(step)).toBeInTheDocument();
    }
  });

  it("renders the real scene image and reconciliation video", async () => {
    renderPage(<LandingPage />);
    const section = await screen.findByRole("region", {
      name: /show the warehouse, the workbench, and the demo/i,
    });

    expect(
      within(section).getByAltText(/procurement assistant workbench comparing supplier quotes/i),
    ).toHaveAttribute("src", "/marketing/procurement-assistant-workbench.jpg");
    expect(
      within(section).getByLabelText(/reconciliation agent demo video/i),
    ).toHaveAttribute("poster", "/marketing/reconciliation-demo-poster.jpg");
  });

  it("renders the customer stories section", async () => {
    renderPage(<LandingPage />);
    const section = await screen.findByRole("region", {
      name: /how real operating teams hand repetitive analysis to agents/i,
    });

    expect(within(section).getByText("Multi-channel commerce team")).toBeInTheDocument();
    expect(within(section).getByText("Wholesale supply chain company")).toBeInTheDocument();
    expect(
      within(section).getByAltText(/procurement assistant workbench/i),
    ).toHaveAttribute("src", "/marketing/procurement-assistant-workbench.jpg");
    expect(
      within(section).getByAltText(/inventory operating dashboard in a warehouse/i),
    ).toHaveAttribute("src", "/marketing/hero-inventory-dashboard.webp");
  });

  it("renders grouped system integrations", async () => {
    renderPage(<LandingPage />);
    const section = await screen.findByRole("region", { name: /bring operating data/i });
    for (const group of [
      "Orders and channels",
      "Cash and fees",
      "Inventory and logistics",
      "Procurement and suppliers",
      "Reports and knowledge",
    ]) {
      expect(within(section).getByText(group)).toBeInTheDocument();
    }
  });

  it("renders the collaboration workflow", async () => {
    renderPage(<LandingPage />);
    const section = await screen.findByRole("region", { name: /agents run the data work/i });
    for (const step of ["Detect", "Analyze", "Suggest", "Approve"]) {
      expect(within(section).getByText(step)).toBeInTheDocument();
    }
  });

  it("renders the comparison table with iTeamify highlight", async () => {
    renderPage(<LandingPage />);
    const section = await screen.findByRole("region", { name: /not erp\. not bi/i });
    expect(within(section).getByText("iTeamify")).toBeInTheDocument();
    expect(within(section).getByText("ERP")).toBeInTheDocument();
    expect(within(section).getByText("BI reports")).toBeInTheDocument();
  });

  it("renders the operating team use cases", async () => {
    renderPage(<LandingPage />);
    expect(await screen.findByRole("region", { name: /give repetitive analysis to agents/i })).toBeInTheDocument();
  });

  it("renders the three pricing cards", async () => {
    renderPage(<LandingPage />);
    const section = await screen.findByRole("region", { name: /start with one operating scene/i });
    expect(within(section).getByText("Trial")).toBeInTheDocument();
    expect(within(section).getByText("Team")).toBeInTheDocument();
    expect(within(section).getByText("Enterprise")).toBeInTheDocument();
  });

  it("renders all 8 FAQ accordion triggers", async () => {
    renderPage(<LandingPage />);
    const faq = await screen.findByRole("region", { name: /common questions/i });
    for (const question of [
      /is iteamify finance software/i,
      /will agents take risky actions/i,
      /connect every system at once/i,
      /who is this for/i,
      /how do agents learn/i,
      /integrate with existing systems/i,
      /how long does setup take/i,
      /different from a chatbot/i,
    ]) {
      expect(within(faq).getByText(question)).toBeInTheDocument();
    }
  });

  it("renders the bottom CTA pointing to /signup", () => {
    renderPage(<LandingPage />);
    expect(
      screen.getAllByRole("link", { name: /start trial/i }).some((link) => (
        link.getAttribute("href") === "/signup"
      )),
    ).toBe(true);
  });

  it("renders the footer marquee with agent phrases", () => {
    renderPage(<LandingPage />);
    expect(screen.getAllByText("Reconciliation agent").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Demand forecasting agent").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Compliance audit agent").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the four-column footer with all link groups", () => {
    renderPage(<LandingPage />);
    for (const column of ["Product", "Resources", "Company", "Legal"]) {
      expect(screen.getByText(column)).toBeInTheDocument();
    }
  });
});
