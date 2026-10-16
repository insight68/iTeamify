import type { Metadata } from "next";
import { AboutPageClient } from "@/features/landing/components/about-page-client";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata(
  "about",
  "zh-Hans",
);

export default function ChineseAboutPage() {
  return <AboutPageClient />;
}

