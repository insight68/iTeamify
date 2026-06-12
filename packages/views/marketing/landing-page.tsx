"use client";

import { LandingNav } from "./nav";
import { HeroSection } from "./hero-section";
import { FeatureCards } from "./feature-cards";
import { IntegrationsSection } from "./integrations-section";
import { ChatDemoSection } from "./chat-demo-section";
import { ComparisonSection } from "./comparison-section";
import { TestimonialsSection } from "./testimonials-section";
import { PricingSection } from "./pricing-section";
import { FaqSection } from "./faq-section";
import { CtaSection } from "./cta-section";
import { LandingFooter } from "./footer";

/**
 * Composed marketing page for suanpan AI reconciliation platform.
 */
export function LandingPage() {
  return (
    <>
      <LandingNav />
      <main>
        <HeroSection />
        <FeatureCards />
        <IntegrationsSection />
        <ChatDemoSection />
        <ComparisonSection />
        <TestimonialsSection />
        <PricingSection />
        <FaqSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </>
  );
}
