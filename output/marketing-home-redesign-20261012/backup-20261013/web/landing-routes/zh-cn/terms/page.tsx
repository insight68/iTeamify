import type { Metadata } from "next";
import { LegalPageClient } from "@/features/landing/components/legal-page-client";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata("terms", "zh-Hans");

export default function ChineseTermsPage() {
  return <LegalPageClient kind="terms" />;
}
