import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://www.teamify.world";

  return [
    {
      url: baseUrl,
      lastModified: new Date("2026-04-01"),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/careers`,
      lastModified: new Date("2026-07-10"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/recon-ai`,
      lastModified: new Date("2026-07-11"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
