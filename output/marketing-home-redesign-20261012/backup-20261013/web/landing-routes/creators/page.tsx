import type { Metadata } from "next";
import { CreatorNavigatorPage } from "@/features/landing/components/creator-navigator-page";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { getRequestMarketingSession } from "@/lib/request-marketing-session";

export const metadata: Metadata = createMarketingMetadata("creators", "en");

export default async function CreatorsPage() {
  const session = await getRequestMarketingSession();
  return <CreatorNavigatorPage locale="en" session={session} />;
}

