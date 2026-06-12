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
  it("renders the hero headline 'Hire AI Employees'", () => {
    renderPage(<LandingPage />);
    expect(
      screen.getByRole("heading", { level: 1 }),
    ).toHaveTextContent(/hire ai employees/i);
  });

  it("renders at least one rotating role in the hero", () => {
    renderPage(<LandingPage />);
    // At least one role should be visible (first one has no aria-hidden)
    const roles = ["ads manager", "designer", "developer", "support", "SRE", "architect"];
    const foundRole = roles.some((role) =>
      screen.queryByText(new RegExp(role, "i")) !== null,
    );
    expect(foundRole).toBe(true);
  });

  it("renders the hero stat badges", () => {
    renderPage(<LandingPage />);
    expect(screen.getAllByText("10+ AI Agents").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("24/7 Availability").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$20/mo per Agent").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the 10 agent role cards", () => {
    renderPage(<LandingPage />);
    const section = screen.getByRole("region", { name: /10 agent roles/i });
    for (const title of [
      "Coding Agent",
      "Review Agent",
      "QA Agent",
      "DevOps Agent",
      "Data Analyst",
      "Security Agent",
      "Docs Agent",
      "SRE Agent",
      "Support Agent",
      "Architect Agent",
    ]) {
      expect(within(section).getByText(title)).toBeInTheDocument();
    }
  });

  it("renders the integrations marquee", () => {
    renderPage(<LandingPage />);
    expect(screen.getAllByText("Claude Code").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Codex").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the two how-it-works steps", () => {
    renderPage(<LandingPage />);
    const section = screen.getByRole("region", { name: /two steps/i });
    for (const title of [
      "Sign up with email",
      "Start using",
    ]) {
      expect(within(section).getByText(title)).toBeInTheDocument();
    }
  });

  it("renders the comparison table", () => {
    renderPage(<LandingPage />);
    const section = screen.getByRole("region", { name: /not a chatbot/i });
    expect(within(section).getByText("Teamify Agent")).toBeInTheDocument();
    expect(within(section).getByText("Chatbot")).toBeInTheDocument();
    expect(within(section).getByText("Human")).toBeInTheDocument();
  });

  it("renders the three-tier pricing cards", () => {
    renderPage(<LandingPage />);
    const section = screen.getByRole("region", { name: /simple, transparent pricing/i });
    expect(within(section).getByText("Free")).toBeInTheDocument();
    expect(within(section).getByText("Pro")).toBeInTheDocument();
    expect(within(section).getByText("Enterprise")).toBeInTheDocument();
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
});
