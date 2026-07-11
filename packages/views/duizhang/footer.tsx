"use client";

import { useT } from "../i18n";
import { AppLink } from "../navigation";
import { FooterMarquee } from "./footer-marquee";

// Computed once at module load. The footer is fully static — pinning
// the year avoids a SSR/CSR hydration mismatch if the page is rendered
// on one side of a midnight boundary and the client mounts on the
// other.
const COPYRIGHT_YEAR = new Date().getFullYear();

type ColumnKey = "product" | "resources" | "company" | "legal";

/** `anchor` = in-page jump (plain <a>); `route` = in-app navigation. */
type FooterLink = { id: string; href: string; kind: "anchor" | "route" };

// Per-column link lists, kept as separate typed arrays. Each link's id
// matches a key under the column's `links` object in the i18n bundle,
// so the column-level `t()` selector keeps the literal key set precise
// (no union of all four columns — the type system proves every id is
// in this column's bundle).
const FOOTER_COLUMNS: Record<
  ColumnKey,
  ReadonlyArray<FooterLink>
> = {
  product: [
    { id: "features", href: "#features", kind: "anchor" },
    { id: "how_it_works", href: "#how-it-works", kind: "anchor" },
    { id: "pricing", href: "/pricing", kind: "route" },
    { id: "changelog", href: "/changelog", kind: "route" },
  ],
  resources: [
    { id: "docs", href: "/docs", kind: "route" },
    { id: "blog", href: "/blog", kind: "route" },
    { id: "api", href: "/docs/api", kind: "route" },
    { id: "github", href: "https://github.com/teamify-ai/teamify", kind: "route" },
  ],
  company: [
    { id: "about", href: "/about", kind: "route" },
    { id: "contact", href: "/contact", kind: "route" },
    { id: "careers", href: "/careers", kind: "route" },
    { id: "privacy", href: "/privacy", kind: "route" },
  ],
  legal: [
    { id: "terms", href: "/terms", kind: "route" },
    { id: "privacy", href: "/privacy", kind: "route" },
    { id: "license", href: "https://github.com/teamify-ai/teamify/blob/main/LICENSE", kind: "route" },
  ],
};

/** Marks each column's `id` literal union so the per-column `labelFor`
 *  closures in <LandingFooter> below know which keys are valid for
 *  which column — TS proves every id used at runtime is actually
 *  present in that column's i18n bundle. */
type LinkIdsFor<C extends ColumnKey> =
  C extends "product" ? "features" | "how_it_works" | "pricing" | "changelog" :
  C extends "resources" ? "docs" | "blog" | "api" | "github" :
  C extends "company" ? "about" | "contact" | "careers" | "privacy" :
  C extends "legal" ? "terms" | "privacy" | "license" :
  never;

/**
 * Multi-column footer. Brand block on the left, four link columns on
 * the right. Anchor links use a plain <a> so the browser handles the
 * in-page jump; everything else goes through AppLink so external
 * routes (and future auth-protected ones) go through the platform
 * NavigationAdapter. The four columns are inlined (not .map()-ed) so
 * each `t(($) => …)` call lives at the top-level render body — i18next's
 * selector overload can't follow the union narrowing through nested
 * `.map((link) => …)` arrow callbacks.
 */
export function LandingFooter() {
  const { t } = useT("duizhang");
  const copyright = t(($) => $.footer.copyright, { year: COPYRIGHT_YEAR });

  return (
    <footer className="border-t border-border/60 bg-muted/40 py-14">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <FooterMarquee />
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight text-foreground">
              <img
                src="/logo.png"
                alt="Teamify"
                className="h-7 w-7 rounded-md"
              />
              <span>iTeamify</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              {t(($) => $.footer.brand_blurb)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 md:col-span-3">
            <FooterColumn
              title={t(($) => $.footer.columns.product.title)}
              links={FOOTER_COLUMNS.product}
              labelFor={(id) =>
                t(($) => $.footer.columns.product.links[id as LinkIdsFor<"product">])
              }
            />
            <FooterColumn
              title={t(($) => $.footer.columns.resources.title)}
              links={FOOTER_COLUMNS.resources}
              labelFor={(id) =>
                t(($) => $.footer.columns.resources.links[id as LinkIdsFor<"resources">])
              }
            />
            <FooterColumn
              title={t(($) => $.footer.columns.company.title)}
              links={FOOTER_COLUMNS.company}
              labelFor={(id) =>
                t(($) => $.footer.columns.company.links[id as LinkIdsFor<"company">])
              }
            />
            <FooterColumn
              title={t(($) => $.footer.columns.legal.title)}
              links={FOOTER_COLUMNS.legal}
              labelFor={(id) =>
                t(($) => $.footer.columns.legal.links[id as LinkIdsFor<"legal">])
              }
            />
          </div>
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>{copyright}</p>
          <p>AI 对账，不止于对账。</p>
        </div>
      </div>
    </footer>
  );
}

interface FooterColumnProps {
  title: string;
  links: ReadonlyArray<FooterLink>;
  /** i18next selector narrowed to this column's `links` shape. */
  labelFor: (id: string) => string;
}

/** Renders one footer column. Dispatches each link to <a> or <AppLink>
 *  based on the link's `kind` discriminator. */
function FooterColumn({ title, links, labelFor }: FooterColumnProps) {
  return (
    <div>
      <h3 className="font-heading text-sm font-semibold text-foreground">
        {title}
      </h3>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.id}>
            {link.kind === "anchor" ? (
              <a
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {labelFor(link.id)}
              </a>
            ) : (
              <AppLink
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {labelFor(link.id)}
              </AppLink>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
