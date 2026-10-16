/**
 * Marketing route registry: the single source of truth for the header nav, the
 * footer link groups, the sitemap, and `generateStaticParams` on the
 * `/solutions/[slug]` and `/features/[slug]` routes.
 *
 * `solutions` entries are audience pages for the small-team positioning;
 * `features` entries are product capability pages. When solution slugs change,
 * the retired slugs must be added to `LEGACY_AUDIENCE_SLUGS` in `proxy.ts` so the
 * old URLs keep resolving instead of 404ing.
 */
export const SERVICE_MARKETING_ROUTES = [
  { kind: "solutions", slug: "product-teams", path: "/solutions/product-teams", en: "Product & engineering teams", zh: "产品与研发团队" },
  { kind: "solutions", slug: "indie-developers", path: "/solutions/indie-developers", en: "Indie developers & studios", zh: "独立开发者与工作室" },
  { kind: "solutions", slug: "ai-native-startups", path: "/solutions/ai-native-startups", en: "AI-native startups", zh: "AI 原生创业团队" },
  { kind: "solutions", slug: "playbook-teams", path: "/solutions/playbook-teams", en: "Teams with a playbook", zh: "有打法要沉淀的团队" },
  { kind: "features", slug: "project-delivery", path: "/features/project-delivery", en: "Projects & collaboration", zh: "项目协作" },
] as const;

export type ServiceMarketingRoute = (typeof SERVICE_MARKETING_ROUTES)[number];
export type ServicePageSlug = ServiceMarketingRoute["slug"];
export type ServicePageKind = ServiceMarketingRoute["kind"];

export function findServiceMarketingRoute(kind: string, slug: string) {
  return SERVICE_MARKETING_ROUTES.find((route) => route.kind === kind && route.slug === slug);
}
