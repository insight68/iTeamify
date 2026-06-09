"use client";

import { LandingNav } from "./nav";
import { HeroSection } from "./hero-section";
import { HowItWorksSection } from "./how-it-works-section";
import { FeatureShowcase } from "./feature-showcase";
import { PricingSection } from "./pricing-section";
import { FaqSection } from "./faq-section";
import { CtaSection } from "./cta-section";
import { LandingFooter } from "./footer";

/**
 * Composed marketing page. Web-only — the desktop app never routes here
 * (logged-in desktop users always have a workspace to land on, and the
 * marketing surface is meaningless without a browser context). The
 * `.landing-light` token lock is applied at the route layout, not here,
 * so it covers anything else that might be rendered on `/` in the future.
 */
export function LandingPage() {
  return (
    <>
      <LandingNav />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <FeatureShowcase />
        <PricingSection />
        <FaqSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </>
  );
}