import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderWithI18n } from "../test/i18n";
import { LandingPage } from "./landing-page";

// Mock navigation — LandingPage uses AppLink for in-app routes, which
// expects a NavigationProvider. The test never exercises navigation, so
// we no-op the provider entirely (same pattern as issue-detail.test.tsx
// and issues-page.test.tsx). renderWithI18n from the shared test helper
// supplies the i18n wrapper.
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
  it("renders the hero headline with gradient emphasis", () => {
    renderPage(<LandingPage />);
    expect(
      screen.getByRole("heading", { level: 1 }),
    ).toHaveTextContent(/agents as teammates/i);
  });

  it("renders the three attribute pills", () => {
    renderPage(<LandingPage />);
    for (const label of ["Real Identity", "Org Memory", "Self-Driven"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders the three how-it-works steps", () => {
    renderPage(<LandingPage />);
    const section = screen.getByRole("region", { name: /three steps/i });
    for (const title of [
      "Create a workspace",
      "Connect a runtime",
      "Assign work to an agent",
    ]) {
      expect(within(section).getByText(title)).toBeInTheDocument();
    }
  });

  it("renders the four feature showcase blocks", () => {
    renderPage(<LandingPage />);
    const section = screen.getByRole("region", { name: /agents that don't just chat/i });
    for (const title of [
      "Ready on day one",
      "Acts before being asked",
      "Remembers your context",
      "Works across time zones",
    ]) {
      expect(within(section).getByText(title)).toBeInTheDocument();
    }
  });

  it("renders the pricing comparison table", () => {
    renderPage(<LandingPage />);
    const section = screen.getByRole("region", { name: /ai teammate vs\. human hire/i });
    expect(within(section).getByText("Teamify Agent")).toBeInTheDocument();
    expect(within(section).getByText("Human Employee")).toBeInTheDocument();
    expect(within(section).getByText("$20")).toBeInTheDocument();
    expect(within(section).getByText("$5,000+")).toBeInTheDocument();
  });

  it("renders all 8 FAQ accordion triggers", () => {
    renderPage(<LandingPage />);
    const faq = screen.getByRole("region", { name: /common questions/i });
    for (const question of [
      /what is teamify, exactly\?/i,
      /how are teamify agents different from chatbots/i,
      /which ai coding tools/i,
      /can i self-host/i,
      /are agents sandboxed/i,
      /is there a limit on how many agents/i,
      /what does it cost/i,
      /how open is/i,
    ]) {
      expect(within(faq).getByText(question)).toBeInTheDocument();
    }
  });

  it("renders the bottom CTA pointing to /signup", () => {
    renderPage(<LandingPage />);
    expect(
      screen.getByRole("link", { name: /create your workspace/i }),
    ).toHaveAttribute("href", "/signup");
  });

  it("renders the footer marquee with benefit phrases", () => {
    renderPage(<LandingPage />);
    expect(screen.getAllByText("Agents that code").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Open source").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the four-column footer with all link groups", () => {
    renderPage(<LandingPage />);
    for (const column of ["Product", "Resources", "Company", "Legal"]) {
      expect(screen.getByText(column)).toBeInTheDocument();
    }
  });

  it("renders the hero mockup with agent identity Atlas", () => {
    renderPage(<LandingPage />);
    expect(screen.getAllByText("Atlas").length).toBeGreaterThanOrEqual(1);
  });
});