import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The login route renders the marketing shell (`LandingHeader` / `LandingFooter`)
 * but lives in the `(auth)` route group, which only loads `globals.css`. Nothing
 * about that combination looks wrong in the component tree — the header simply
 * had no `.service-*` rules to paint with, so the nav stacked vertically, the
 * skip link stayed visible and the container lost its width.
 *
 * That failure is invisible to render tests (the components are correct; the
 * stylesheet never arrives) and to typecheck, so it is pinned at the source
 * level here. `(public)/experts` is the precedent: same shell, same explicit
 * import, because `landing.css` — which `@import`s the stylesheet — is only
 * reachable from the `(landing)` group.
 */

function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) throw new Error("repo root not found");
    dir = parent;
  }
}

const repoRoot = findRepoRoot(import.meta.dirname);
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const MARKETING_CSS = "apps/web/features/landing/service-marketing.css";
/**
 * Matches a live side-effect import only. A commented-out or merely mentioned
 * path must not satisfy it — that is exactly the shape of the original bug.
 */
const SHELL_IMPORT_RE =
  /^import\s+["'][^"']*features\/landing\/service-marketing\.css["'];?$/m;

describe("login route loads the marketing shell stylesheet", () => {
  it("imports service-marketing.css from the login layout", () => {
    const layout = read("apps/web/app/(auth)/login/layout.tsx");
    expect(layout).toMatch(SHELL_IMPORT_RE);
  });

  it("keeps the marketing route group on its own CSS entry", () => {
    // `(public)/experts` used to be the other marketing-shell route outside the
    // `(landing)` group, importing the stylesheet explicitly. That route is gone
    // and `(public)` now renders inside AppShell, so `(landing)` is the only
    // group that reaches these rules — through landing.css, which is why those
    // routes need no explicit import.
    expect(read("apps/web/app/(landing)/landing.css")).toContain(
      '@import "../../features/landing/service-marketing.css";',
    );
  });

  it("ships the rules the shell depends on", () => {
    const css = read(MARKETING_CSS);
    for (const selector of [
      ".landing-brand",
      ".service-container",
      ".service-header",
      ".service-header-inner",
      ".service-nav",
      ".service-skip-link",
      ".service-footer",
    ]) {
      expect(css).toContain(selector);
    }
  });
});

describe("auth card keeps a symmetric vertical inset", () => {
  /**
   * `Card` removes its own bottom padding as soon as a `card-footer` exists
   * (`has-data-[slot=card-footer]:pb-0`) — normally correct, because the footer
   * is a full-bleed bar that supplies the inset itself. The auth shell strips
   * the footer back to a transparent, borderless slot, so the inset has to be
   * handed back to the footer or the last row sits flush against the rounded
   * bottom edge.
   */
  it("hands the bottom inset back to the footer it flattened", () => {
    const page = read("apps/web/app/(auth)/login/page.tsx");
    const cardClasses = page.match(
      /const BRAND_AUTH_CARD_CLASS_NAME =\s*"([^"]+)"/,
    )?.[1];
    expect(cardClasses, "BRAND_AUTH_CARD_CLASS_NAME not found").toBeTruthy();

    expect(cardClasses!).toContain("[&_[data-slot=card-footer]]:border-0");
    expect(cardClasses!).toMatch(/\[&_\[data-slot=card-footer\]\]:pb-[1-9]/);
  });
});
