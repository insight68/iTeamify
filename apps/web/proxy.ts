import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE } from "@iteamify/core/i18n";
import {
  ITEAMIFY_LOCALE_HEADER,
  resolveLocaleFromSignals,
} from "./lib/locale-routing";
import { runtimeRewriteDestination } from "./config/runtime-urls";
import { isOfficialMarketingHost } from "./lib/public-host";
import { marketingLocaleFromPathname } from "./lib/marketing-i18n";

// Old workspace-scoped route segments that existed before the URL refactor
// (pre-#1131). Any URL with these as the FIRST segment is a legacy URL that
// needs to be rewritten to /{slug}/{route}/... so old bookmarks, deep links,
// and post-revert-and-reapply users don't hit 404.
const LEGACY_ROUTE_SEGMENTS = new Set([
  "issues",
  "projects",
  "agents",
  "squads",
  "inbox",
  "my-issues",
  "autopilots",
  "runtimes",
  "skills",
  "settings",
  "connections",
  "usage",
  "knowledge",
  "business",
]);

// Audience slugs the marketing site has retired. Two generations are listed:
// the original "service business" audiences and the export-business audiences
// that replaced them. Neither set has a meaningful one-to-one successor now
// that the site positions around small teams, so they all land on the audience
// section of the homepage rather than on an unrelated page, which would be
// worse than a plain 404 for a crawler reading the redirect.
const LEGACY_AUDIENCE_SLUGS = [
  "ai-agencies",
  "software-teams",
  "it-consultants",
  "independent-creators",
  "manufacturers",
  "trading-companies",
  "repeat-business",
  "export-soho",
] as const;

function resolveLocale(req: NextRequest): string {
  const marketingLocale = marketingLocaleFromPathname(req.nextUrl.pathname);
  if (marketingLocale) return marketingLocale;

  return resolveLocaleFromSignals({
    cookieLocale: req.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: req.headers.get("accept-language"),
  });
}

// Forward the resolved locale to RSC layouts via the `x-iteamify-locale`
// request header. layout.tsx reads it through `await headers()`. The
// `request: { headers }` form is what makes the header land on the upstream
// request — without it the value would only sit on the response.
function nextWithLocale(req: NextRequest): NextResponse {
  const headers = new Headers(req.headers);
  headers.set(ITEAMIFY_LOCALE_HEADER, resolveLocale(req));
  return NextResponse.next({ request: { headers } });
}

// Next.js 16 renamed `middleware` → `proxy`. API surface (NextRequest /
// NextResponse / cookies / matcher) is identical; the only behavioral
// change is the runtime — proxy is forced to nodejs and cannot opt into
// edge.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/homepage" || pathname.startsWith("/homepage/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url, 308);
  }

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/en" ? "/" : pathname.slice(3);
    return NextResponse.redirect(url, 308);
  }

  // --- Legacy marketing URLs: the four pre-export audience pages ---
  // `<locale>/solutions/<old-slug>`, with the locale prefix optional. Query
  // strings are dropped because none of them map onto the homepage, but the
  // fragment is kept so the visitor lands on the audience section itself.
  const legacyAudienceSlug = LEGACY_AUDIENCE_SLUGS.find(
    (slug) =>
      pathname === `/solutions/${slug}` ||
      pathname === `/zh-cn/solutions/${slug}`,
  );
  if (legacyAudienceSlug) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.startsWith("/zh-cn/") ? "/zh-cn" : "/";
    url.search = "";
    url.hash = "#solutions";
    return NextResponse.redirect(url, 308);
  }
  const runtimeDestination = runtimeRewriteDestination(pathname, process.env);
  if (runtimeDestination) {
    const url = new URL(runtimeDestination);
    url.search = req.nextUrl.search;
    return NextResponse.rewrite(url);
  }

  const hasSession = req.cookies.has("iteamify_logged_in");
  const lastSlug = req.cookies.get("last_workspace_slug")?.value;

  // --- Legacy URL redirect: /issues/... → /{slug}/issues/... ---
  // Old bookmarks and clients that hit us before the slug migration would
  // otherwise 404 since the route moved under [workspaceSlug].
  const firstSegment = pathname.split("/")[1] ?? "";
  if (LEGACY_ROUTE_SEGMENTS.has(firstSegment)) {
    const url = req.nextUrl.clone();

    if (!hasSession) {
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    if (lastSlug) {
      // Preserve deep-link path + query: /issues/abc → /{lastSlug}/issues/abc
      url.pathname = `/${lastSlug}${pathname}`;
      return NextResponse.redirect(url);
    }

    // Logged-in but no cookie yet (first login since slug migration, or
    // cookie cleared). Bounce to root; the root-path logic below picks a
    // workspace and writes the cookie, then future hits short-circuit here.
    url.pathname = "/";
    return NextResponse.redirect(url);
  }


  // --- Root path: redirect logged-in users to their last workspace ---
  // The official cloud host also serves the public marketing site. Visiting
  // https://aurocreator.com/ must remain a public-site navigation even when a local
  // desktop/runtime session has fresh auth cookies; explicit app routes such
  // as /acme/issues and legacy /issues still route to the workspace app.
  if (
    pathname === "/" &&
    hasSession &&
    !isOfficialMarketingHost(req.nextUrl.hostname)
  ) {
    const url = req.nextUrl.clone();
    // The old client fallback needed the complete auth/query runtime on the
    // homepage to resolve this no-cookie case. Send it to onboarding instead;
    // that app route validates the session and resolves onboarded users to a
    // workspace or workspace creation after its normal bootstrap.
    url.pathname = lastSlug ? `/${lastSlug}/issues` : "/onboarding";
    return NextResponse.redirect(url);
  }

  // --- Default: forward locale header to RSC, no redirect/rewrite ---
  // Covers logged-out root path, /login, /:slug/*, and everything else.
  return nextWithLocale(req);
}

export const config = {
  // i18n header must land on every page request, so we use the standard
  // negative-lookahead pattern from Next's i18n guide, plus explicit runtime
  // proxy routes whose upstream origins are resolved from process.env at
  // request time instead of being baked into next.config.js at build time.
  matcher: [
    "/api/:path*",
    "/auth/:path*",
    "/uploads/:path*",
    "/ws",
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)",
  ],
};
