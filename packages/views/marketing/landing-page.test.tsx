import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderWithI18n } from "../test/i18n";
import { LandingPage } from "./landing-page";

// Mock navigation — LandingPage uses AppLink for in-app routes, which
// expects a NavigationProvider. The test never exercises navigation, so
// we no-op the provider entirely.
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
  it("renders the hero headline about reconciliation", () => {
    renderPage(<LandingPage />);
    expect(
      screen.getByRole("heading", { level: 1 }),
    ).toHaveTextContent(/reconcile monthly accounts/i);
  });

  it("renders the hero stat badges", () => {
    renderPage(<LandingPage />);
    expect(screen.getAllByText(/12\+ marketplace/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/99\.9% accuracy/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders the 4 feature cards", () => {
    renderPage(<LandingPage />);
    const section = screen.getByRole("region", { name: /4 core capabilities/i });
    for (const title of [
      "Order Reconciliation",
      "Fee Verification",
      "Profit Analysis",
      "Anomaly Monitoring",
    ]) {
      expect(within(section).getByText(title)).toBeInTheDocument();
    }
  });

  it("renders the integrations marquee with e-commerce platforms", () => {
    renderPage(<LandingPage />);
    expect(screen.getAllByText("Taobao/Tmall").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Douyin").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the chat demo section", () => {
    renderPage(<LandingPage />);
    expect(screen.getByRole("region", { name: /no excel skills needed/i })).toBeInTheDocument();
  });

  it("renders the comparison table with suanpan highlight", () => {
    renderPage(<LandingPage />);
    const section = screen.getByRole("region", { name: /not excel\. not accounting software/i });
    expect(within(section).getByText("Suanpan")).toBeInTheDocument();
    expect(within(section).getByText("Manual")).toBeInTheDocument();
    expect(within(section).getByText("Excel")).toBeInTheDocument();
  });

  it("renders the testimonials section", () => {
    renderPage(<LandingPage />);
    expect(screen.getByRole("region", { name: /turned reconciliation from a 3-day nightmare/i })).toBeInTheDocument();
  });

  it("renders the three-tier pricing cards", () => {
    renderPage(<LandingPage />);
    const section = screen.getByRole("region", { name: /simple, transparent pricing/i });
    expect(within(section).getByText("Free Trial")).toBeInTheDocument();
    expect(within(section).getByText("Pro")).toBeInTheDocument();
    expect(within(section).getByText("Enterprise")).toBeInTheDocument();
  });

  it("renders all 8 FAQ accordion triggers", () => {
    renderPage(<LandingPage />);
    const faq = screen.getByRole("region", { name: /common questions/i });
    for (const question of [
      /which platforms do you support/i,
      /is my data secure/i,
      /what if i don't know how to use/i,
      /what payment methods/i,
      /can i get a refund/i,
      /is there an api/i,
      /do i need to sign a contract/i,
      /how is this different from hiring an accountant/i,
    ]) {
      expect(within(faq).getByText(question)).toBeInTheDocument();
    }
  });

  it("renders the bottom CTA pointing to /signup", () => {
    renderPage(<LandingPage />);
    expect(
      screen.getByRole("link", { name: /start free trial — no credit card required/i }),
    ).toHaveAttribute("href", "/signup");
  });

  it("renders the footer marquee with benefit phrases", () => {
    renderPage(<LandingPage />);
    expect(screen.getAllByText("94% auto-match").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("14-day free trial").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the four-column footer with all link groups", () => {
    renderPage(<LandingPage />);
    for (const column of ["Product", "Resources", "Company", "Legal"]) {
      expect(screen.getByText(column)).toBeInTheDocument();
    }
  });
});
