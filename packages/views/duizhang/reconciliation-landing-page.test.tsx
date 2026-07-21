import type { ReactElement } from "react";
import { renderWithI18n } from "../test/i18n";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReconciliationLandingPage } from "./reconciliation-landing-page";

vi.mock("../navigation", () => ({
  AppLink: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useNavigation: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: "/recon-ai",
    searchParams: new URLSearchParams(),
    getShareableUrl: (path: string) => path,
  }),
}));

function renderPage(ui: ReactElement) {
  return renderWithI18n(ui);
}

describe("ReconciliationLandingPage", () => {
  it("restores the reconciliation landing page under its own route", async () => {
    renderPage(<ReconciliationLandingPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Reconcile monthly accounts in 30 minutes, not 3 days",
    );
    expect(screen.getByRole("link", { name: /iTeamify/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("link", { name: "Reconciliation assistant" }),
    ).toHaveAttribute("href", "/recon-ai");

    const features = await screen.findByRole("region", {
      name: /4 core capabilities/i,
    });
    for (const title of [
      "Order Reconciliation",
      "Fee Verification",
      "Profit Analysis",
      "Anomaly Monitoring",
    ]) {
      expect(within(features).getByText(title)).toBeInTheDocument();
    }
  });
});
