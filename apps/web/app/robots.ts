import type { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/ws",
          "/auth/",
          "/uploads/",
        ],
      },
    ],
    sitemap: `${SITE_CONFIG.origin}/sitemap.xml`,
    host: SITE_CONFIG.origin,
  };
}
