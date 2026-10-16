import type { Metadata } from "next";
import { ITeamifyLanding } from "@/features/landing/components/iteamify-landing";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { getRequestMarketingSession } from "@/lib/request-marketing-session";

export const metadata: Metadata = createMarketingMetadata("home", "en");

export default async function HomepagePage() {
  const session = await getRequestMarketingSession();
  return <ITeamifyLanding locale="en" session={session} />;
}
