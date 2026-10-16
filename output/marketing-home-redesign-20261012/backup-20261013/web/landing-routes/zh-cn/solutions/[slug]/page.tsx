import { notFound } from "next/navigation";
import { ServiceDetailPage } from "@/features/landing/components/service-detail-page";
import { getServicePage } from "@/features/landing/content/service-pages";
import { SERVICE_MARKETING_ROUTES } from "@/lib/service-marketing-routes";
import { createServicePageMetadata } from "@/lib/service-page-metadata";
import { getRequestMarketingSession } from "@/lib/request-marketing-session";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return SERVICE_MARKETING_ROUTES.filter((route) => route.kind === "solutions")
    .map((route) => ({ slug: route.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const metadata = createServicePageMetadata("solutions", slug, "zh-Hans");
  if (!metadata) notFound();
  return metadata;
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const page = getServicePage("solutions", slug, "zh-Hans");
  if (!page) notFound();
  const session = await getRequestMarketingSession();
  return <ServiceDetailPage {...page} locale="zh-Hans" session={session} />;
}
