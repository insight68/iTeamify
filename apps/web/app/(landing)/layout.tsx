import type { Metadata } from "next";
import { LocaleProvider } from "@/features/landing/i18n";
import { getRequestLocale } from "@/lib/request-locale";
import { SITE_CONFIG, SITE_URL } from "@/config/site";
import { normalizeMarketingLocale } from "@/lib/marketing-i18n";
import { getRequestMarketingSession } from "@/lib/request-marketing-session";
import "./landing.css";

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: {
    default: "iteamify | Where small teams and AI agents work the same board",
    template: "%s | iteamify",
  },
  openGraph: {
    siteName: SITE_CONFIG.siteName,
  },
};

export default async function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialLocale = await getRequestLocale();
  const initialSession = await getRequestMarketingSession();
  const marketingLocale = normalizeMarketingLocale(initialLocale);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_CONFIG.origin}/#organization`,
        name: SITE_CONFIG.organizationName,
        url: SITE_CONFIG.origin,
        logo: `${SITE_CONFIG.origin}/brand/iteamify-icon.png`,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_CONFIG.origin}/#website`,
        name: SITE_CONFIG.siteName,
        url: SITE_CONFIG.origin,
        inLanguage: marketingLocale === "zh-Hans" ? "zh-CN" : "en",
        publisher: { "@id": `${SITE_CONFIG.origin}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_CONFIG.origin}/#product`,
        name: SITE_CONFIG.productName,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, macOS, Windows, Linux",
        description:
          marketingLocale === "zh-Hans"
            ? "iteamify 是面向小团队的 AI 原生协作平台：任务、项目、知识与智能体在同一个工作空间里。 "
            : SITE_CONFIG.description,
        publisher: { "@id": `${SITE_CONFIG.origin}/#organization` },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div
        className="landing-brand landing-light h-full overflow-x-hidden overflow-y-auto bg-[#f7f5f2] text-[#141724]"
      >
        <LocaleProvider
          initialLocale={initialLocale}
          initialSession={initialSession}
        >
          {children}
        </LocaleProvider>
      </div>
    </>
  );
}
