"use client";

import { LandingHeader } from "./landing-header";
import { LandingFooter } from "./landing-footer";
import { useLocale } from "../i18n";

export function LegalPageClient({ kind }: { kind: "privacy" | "terms" }) {
  const { t } = useLocale();
  const legal = kind === "privacy" ? t.privacy : t.terms;

  return (
    <>
      <LandingHeader variant="light" />
      <main className="bg-white text-[#0a0d12]">
        <div className="mx-auto max-w-[720px] px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
          <h1 className="font-[family-name:var(--font-serif)] text-[2.6rem] leading-[1.05] tracking-[-0.03em] sm:text-[3.4rem]">
            {legal.title}
          </h1>
          <p className="mt-3 text-[13px] font-medium uppercase tracking-[0.08em] text-[#0a0d12]/40">
            {legal.updated}
          </p>
          <p className="mt-8 text-[15px] leading-[1.8] text-[#0a0d12]/70 sm:text-[16px]">
            {legal.intro}
          </p>
          <div className="mt-12 space-y-10">
            {legal.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#0a0d12] sm:text-[20px]">
                  {section.heading}
                </h2>
                <div className="mt-3 space-y-3 text-[15px] leading-[1.8] text-[#0a0d12]/70">
                  {section.paragraphs.map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
      <LandingFooter showCta={false} />
    </>
  );
}
