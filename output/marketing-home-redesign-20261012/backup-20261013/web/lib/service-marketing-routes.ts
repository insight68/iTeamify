/**
 * Marketing route registry: the single source of truth for the header nav, the
 * footer link groups, the sitemap, and `generateStaticParams` on the
 * `/solutions/[slug]` and `/features/[slug]` routes.
 *
 * `solutions` entries are export audiences; `features` entries are product
 * capability pages. Feature slugs are deliberately unchanged from the earlier
 * service-business positioning (URL stability); only their labels and copy moved
 * to the export vocabulary. Solution slugs did change — see
 * `LEGACY_SOLUTION_PATHS` in `proxy.ts` for the 301s that cover the old URLs.
 */
export const SERVICE_MARKETING_ROUTES = [
  { kind: "solutions", slug: "manufacturers", path: "/solutions/manufacturers", en: "Factories & manufacturers", zh: "制造企业与工厂" },
  { kind: "solutions", slug: "trading-companies", path: "/solutions/trading-companies", en: "Trading companies", zh: "贸易公司与出口商" },
  { kind: "solutions", slug: "repeat-business", path: "/solutions/repeat-business", en: "Repeat business", zh: "老客户复购与维护" },
  { kind: "solutions", slug: "export-soho", path: "/solutions/export-soho", en: "Independent exporters", zh: "外贸 SOHO 与个人业务员" },
  { kind: "features", slug: "project-delivery", path: "/features/project-delivery", en: "Sampling & fulfillment", zh: "打样与订单履约" },
] as const;

export type ServiceMarketingRoute = (typeof SERVICE_MARKETING_ROUTES)[number];
export type ServicePageSlug = ServiceMarketingRoute["slug"];
export type ServicePageKind = ServiceMarketingRoute["kind"];

export function findServiceMarketingRoute(kind: string, slug: string) {
  return SERVICE_MARKETING_ROUTES.find((route) => route.kind === kind && route.slug === slug);
}
