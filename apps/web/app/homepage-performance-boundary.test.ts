import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("homepage performance boundaries", () => {
  it("keeps the static homepage body on the server", () => {
    const source = read(
      "apps/web/features/landing/components/iteamify-landing.tsx",
    );
    expect(source).not.toMatch(/^\s*["']use client["']/);
    expect(source).not.toContain("useAuthStore");
    expect(source).not.toContain("useDashboardCtaHref");
    expect(source).not.toContain("useLocale");
    expect(source).toContain("locale: MarketingLocale");
  });

  it("keeps authenticated application providers out of the root layout", () => {
    const rootLayout = read("apps/web/app/layout.tsx");
    const appShell = read("apps/web/components/app-shell.tsx");
    expect(rootLayout).not.toContain("WebProviders");
    expect(rootLayout).not.toContain("RESOURCES");
    expect(appShell).toContain("WebProviders");
    expect(appShell).toContain("RESOURCES[locale]");
  });

  it("scopes Tailwind discovery to marketing source trees", () => {
    const css = read("apps/web/app/(landing)/landing.css");
    expect(css).toContain('@import "tailwindcss" source(none)');
    expect(css).toContain('@source "../../features/landing/**/*.{ts,tsx}"');
    expect(css).not.toContain('packages/views/**/*.{ts,tsx}');
    expect(css).toMatch(/body\s*\{[\s\S]*overflow:\s*hidden/);
  });

  it("does not hide first-fold content behind an opacity entrance", () => {
    const landing = read(
      "apps/web/features/landing/components/iteamify-landing.tsx",
    );
    const css = read("apps/web/app/(landing)/landing.css");
    expect(landing).not.toContain("iteamify-rise");
    expect(css).not.toContain("box-shadow: 0 0 0");
    expect(css).toContain("prefers-reduced-motion: no-preference");
    expect(css).not.toContain("will-change");
  });
});
