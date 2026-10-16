import type { Metadata } from "next";
import { LegalPageClient } from "@/features/landing/components/legal-page-client";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata("privacy", "en");

export default function PrivacyPage() {
  return <LegalPageClient kind="privacy" />;
}
