import type { ReactElement } from "react";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../test/i18n";
import { LandingNav } from "./nav";

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
    pathname: "/",
    searchParams: new URLSearchParams(),
    getShareableUrl: (path: string) => path,
  }),
}));

function renderNav(ui: ReactElement, locale: "en" | "zh-Hans" = "en") {
  return renderWithI18n(ui, { locale });
}

describe("LandingNav", () => {
  it("renders the unified public navigation targets", () => {
    renderNav(<LandingNav />);

    for (const [name, href] of [
      ["Home", "/"],
      ["Reconciliation assistant", "/duizhang"],
      ["Pricing", "/#pricing"],
      ["FAQ", "/#faq"],
    ] as const) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }

    expect(screen.queryByRole("link", { name: "Systems" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Collaboration" })).not.toBeInTheDocument();
  });

  it("opens the same navigation items on mobile", async () => {
    renderNav(<LandingNav />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );

    const menu = await screen.findByRole("dialog");
    expect(within(menu).getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      within(menu).getByRole("link", { name: "Reconciliation assistant" }),
    ).toHaveAttribute("href", "/duizhang");
  });

  it("uses the approved Chinese navigation labels", () => {
    renderNav(<LandingNav />, "zh-Hans");

    expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "对账助理" })).toHaveAttribute(
      "href",
      "/duizhang",
    );
  });
});
