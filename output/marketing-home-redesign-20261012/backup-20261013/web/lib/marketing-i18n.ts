import type { SupportedLocale } from "@iteamify/core/i18n";
import { SERVICE_MARKETING_ROUTES } from "./service-marketing-routes";

export type MarketingLocale = "en" | "zh-Hans";

export const MARKETING_LOCALES: readonly MarketingLocale[] = [
  "en",
  "zh-Hans",
];

export const MARKETING_HTML_LANG: Record<MarketingLocale, string> = {
  en: "en",
  "zh-Hans": "zh-CN",
};

export const MARKETING_HREFLANG: Record<MarketingLocale, string> = {
  en: "en",
  "zh-Hans": "zh-CN",
};

export const MARKETING_OG_LOCALE: Record<MarketingLocale, string> = {
  en: "en_US",
  "zh-Hans": "zh_CN",
};

const ENGLISH_MARKETING_PATHS = new Set([
  ...SERVICE_MARKETING_ROUTES.map((route) => route.path),
  "/",
  "/about",
  "/creators",
  "/contact-sales",
  "/privacy",
  "/terms",
]);

const ZH_PREFIX = "/zh-cn";

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function isEnglishMarketingPath(pathname: string): boolean {
  return ENGLISH_MARKETING_PATHS.has(pathname);
}

export function normalizeMarketingLocale(
  locale: SupportedLocale,
): MarketingLocale {
  return locale === "zh-Hans" ? "zh-Hans" : "en";
}

export function marketingLocaleFromPathname(
  pathname: string,
): MarketingLocale | null {
  const normalized = normalizePathname(pathname);
  if (isEnglishMarketingPath(normalized)) return "en";

  const englishPath = normalized === ZH_PREFIX
    ? "/"
    : normalized.startsWith(`${ZH_PREFIX}/`)
      ? normalized.slice(ZH_PREFIX.length)
      : null;

  return englishPath && isEnglishMarketingPath(englishPath)
    ? "zh-Hans"
    : null;
}

export function englishMarketingPath(pathname: string): string | null {
  const normalized = normalizePathname(pathname);
  if (isEnglishMarketingPath(normalized)) return normalized;
  if (normalized === ZH_PREFIX) return "/";
  if (!normalized.startsWith(`${ZH_PREFIX}/`)) return null;

  const englishPath = normalized.slice(ZH_PREFIX.length);
  return isEnglishMarketingPath(englishPath) ? englishPath : null;
}

export function localizedMarketingPath(
  pathname: string,
  locale: MarketingLocale,
): string {
  const englishPath = englishMarketingPath(pathname) ?? "/";
  if (locale === "en") return englishPath;
  return englishPath === "/" ? ZH_PREFIX : `${ZH_PREFIX}${englishPath}`;
}

export function localizedMarketingHref(
  href: string,
  locale: MarketingLocale,
): string {
  if (!href.startsWith("/")) return href;

  const hashIndex = href.indexOf("#");
  const queryIndex = href.indexOf("?");
  const suffixIndex = [hashIndex, queryIndex]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? href.length;
  const pathname = href.slice(0, suffixIndex) || "/";
  const suffix = href.slice(suffixIndex);
  const localized = localizedMarketingPath(pathname, locale);
  return `${localized}${suffix}`;
}
