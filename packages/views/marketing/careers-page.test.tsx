import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderWithI18n } from "../test/i18n";
import { CareersPage } from "./careers-page";

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
    pathname: "/careers",
    searchParams: new URLSearchParams(),
    getShareableUrl: (p: string) => p,
  }),
  NavigationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function renderPage(ui: ReactElement) {
  return renderWithI18n(ui);
}

describe("CareersPage", () => {
  it("renders the enterprise agent FDE role", () => {
    renderPage(<CareersPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "企业 Agent FDE 工程师" }),
    ).toBeInTheDocument();
    expect(screen.getByText("企业 Agent 前端部署工程师")).toBeInTheDocument();
  });

  it("renders role sections and the application email", () => {
    renderPage(<CareersPage />);

    expect(screen.getByText("岗位要求")).toBeInTheDocument();
    expect(screen.getByText("加分项")).toBeInTheDocument();
    expect(screen.getByText(/vibe coding 项目经验/)).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /hr@junpu\.org|投递简历/ }).some((link) => (
        link.getAttribute("href") === "mailto:hr@junpu.org"
      )),
    ).toBe(true);
  });
});
