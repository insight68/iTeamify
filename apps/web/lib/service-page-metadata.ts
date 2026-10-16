import type { Metadata } from "next";
import { SITE_CONFIG } from "@/config/site";
import { getServicePage } from "@/features/landing/content/service-pages";
import { MARKETING_HREFLANG, MARKETING_OG_LOCALE, localizedMarketingPath, type MarketingLocale } from "./marketing-i18n";

export function createServicePageMetadata(kind: string, slug: string, locale: MarketingLocale): Metadata | null {
  const page = getServicePage(kind, slug, locale);
  if (!page) return null;
  const { route, copy } = page;
  const englishPath = localizedMarketingPath(route.path, "en");
  const chinesePath = localizedMarketingPath(route.path, "zh-Hans");
  const canonical = localizedMarketingPath(route.path, locale);
  const image = locale === "zh-Hans" ? "/zh-cn/opengraph-image" : "/opengraph-image";
  return {
    title: { absolute: copy.title },
    description: copy.description,
    alternates: {
      canonical,
      languages: {
        [MARKETING_HREFLANG.en]: englishPath,
        [MARKETING_HREFLANG["zh-Hans"]]: chinesePath,
        "x-default": englishPath,
      },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: SITE_CONFIG.siteName,
      title: copy.title,
      description: copy.description,
      url: canonical,
      locale: MARKETING_OG_LOCALE[locale],
      alternateLocale: [MARKETING_OG_LOCALE[locale === "en" ? "zh-Hans" : "en"]],
      images: [{ url: image, width: 1200, height: 630, alt: copy.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: [image],
    },
  };
}
