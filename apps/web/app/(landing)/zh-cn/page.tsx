import type { Metadata } from "next";
import { ITeamifyLanding } from "@/features/landing/components/iteamify-landing";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { getRequestMarketingSession } from "@/lib/request-marketing-session";

export const metadata: Metadata = createMarketingMetadata("home", "zh-Hans");

export default async function ChineseLandingPage() {
  const session = await getRequestMarketingSession();
  return <ITeamifyLanding locale="zh-Hans" session={session} />;
}
