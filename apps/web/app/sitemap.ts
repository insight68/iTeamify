import type { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/config/site";
import { SERVICE_MARKETING_ROUTES } from "@/lib/service-marketing-routes";
import {
  MARKETING_HREFLANG,
  localizedMarketingPath,
  type MarketingLocale,
} from "@/lib/marketing-i18n";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    ...SERVICE_MARKETING_ROUTES.map((route) => ({
      path: route.path,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { path: "/", changeFrequency: "weekly" as const, priority: 1 },
    { path: "/about", changeFrequency: "monthly" as const, priority: 0.7 },
    { path: "/creators", changeFrequency: "weekly" as const, priority: 0.8 },
    {
      path: "/contact-sales",
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    { path: "/privacy", changeFrequency: "yearly" as const, priority: 0.3 },
    { path: "/terms", changeFrequency: "yearly" as const, priority: 0.3 },
  ];
  const locales: MarketingLocale[] = ["en", "zh-Hans"];

  return pages.flatMap((page) => {
    const languages = {
      [MARKETING_HREFLANG.en]: `${SITE_CONFIG.origin}${localizedMarketingPath(page.path, "en")}`,
      [MARKETING_HREFLANG["zh-Hans"]]: `${SITE_CONFIG.origin}${localizedMarketingPath(page.path, "zh-Hans")}`,
      "x-default": `${SITE_CONFIG.origin}${localizedMarketingPath(page.path, "en")}`,
    };

    return locales.map((locale) => ({
      url: `${SITE_CONFIG.origin}${localizedMarketingPath(page.path, locale)}`,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
      alternates: { languages },
    }));
  });
}
