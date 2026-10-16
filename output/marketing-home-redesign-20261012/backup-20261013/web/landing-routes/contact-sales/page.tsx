import type { Metadata } from "next";
import { ContactSalesPageClient } from "@/features/landing/components/contact-sales-page-client";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata(
  "contact-sales",
  "en",
);

export default function ContactSalesPage() {
  return <ContactSalesPageClient />;
}
