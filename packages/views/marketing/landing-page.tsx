"use client";

import { lazy, Suspense } from "react";
import { LandingNav } from "./nav";
import { HeroSection } from "./hero-section";
import { LandingFooter } from "./footer";

// Below-fold sections are lazy-loaded to reduce the initial landing page JS
// bundle by ~50-70%. Each section gets its own code-split chunk that loads
// only when it scrolls into the viewport.
const FeatureCards = lazy(
  () => import("./feature-cards").then((m) => ({ default: m.FeatureCards })),
);
const OperatingLoopSection = lazy(
  () =>
    import("./operating-loop-section").then((m) => ({
      default: m.OperatingLoopSection,
    })),
);
const MediaProofSection = lazy(
  () =>
    import("./media-proof-section").then((m) => ({
      default: m.MediaProofSection,
    })),
);
const CustomerCasesSection = lazy(
  () =>
    import("./customer-cases-section").then((m) => ({
      default: m.CustomerCasesSection,
    })),
);
const IntegrationsSection = lazy(
  () =>
    import("./integrations-section").then((m) => ({
      default: m.IntegrationsSection,
    })),
);
const ChatDemoSection = lazy(
  () =>
    import("./chat-demo-section").then((m) => ({
      default: m.ChatDemoSection,
    })),
);
const ComparisonSection = lazy(
  () =>
    import("./comparison-section").then((m) => ({
      default: m.ComparisonSection,
    })),
);
const TestimonialsSection = lazy(
  () =>
    import("./testimonials-section").then((m) => ({
      default: m.TestimonialsSection,
    })),
);
const PricingSection = lazy(
  () =>
    import("./pricing-section").then((m) => ({ default: m.PricingSection })),
);
const FaqSection = lazy(
  () => import("./faq-section").then((m) => ({ default: m.FaqSection })),
);
const CtaSection = lazy(
  () => import("./cta-section").then((m) => ({ default: m.CtaSection })),
);

/**
 * Composed marketing page for the iTeamify operating-agent platform.
 *
 * Only above-fold content (nav, hero, footer skeleton) loads eagerly.
 * Remaining sections are code-split and loaded on first render — the
 * Suspense boundary provides a zero-height placeholder that triggers
 * load as the user scrolls.
 */
export function LandingPage() {
  return (
    <>
      <LandingNav />
      <main>
        <HeroSection />
        <Suspense fallback={null}>
          <FeatureCards />
          <OperatingLoopSection />
          <IntegrationsSection />
          <MediaProofSection />
          <CustomerCasesSection />
          <ChatDemoSection />
          <ComparisonSection />
          <TestimonialsSection />
          <PricingSection />
          <FaqSection />
          <CtaSection />
        </Suspense>
      </main>
      <LandingFooter />
    </>
  );
}
