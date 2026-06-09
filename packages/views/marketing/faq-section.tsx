"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@teamify/ui/components/ui/accordion";
import { useT } from "../i18n";

const FAQ_KEYS = [
  "what_is_teamify",
  "how_agents_differ",
  "which_clis",
  "self_host",
  "agent_security",
  "agent_limits",
  "pricing",
  "open_source",
] as const;

/**
 * Single-open FAQ using the shared shadcn/Base UI Accordion. Eight
 * questions cover the most common objections — "what is it", "how are
 * agents different", "will my tools work", "can I self-host", "is it
 * safe", "agent limits", "what does it cost", "how open is it" — and
 * the answers point at existing docs / repo material so they're
 * verifiable rather than marketing-fluff.
 */
export function FaqSection() {
  const { t } = useT("marketing");
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="border-b border-border/60 bg-muted/30 py-20 md:py-28"
    >
      <div className="mx-auto max-w-3xl px-4 md:px-6">
        <h2
          id="faq-heading"
          className="mb-10 text-center font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl"
        >
          {t(($) => $.faq.heading)}
        </h2>
        <Accordion>
          {FAQ_KEYS.map((key) => (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger>
                {t(($) => $.faq.items[key].question)}
              </AccordionTrigger>
              <AccordionContent>
                {t(($) => $.faq.items[key].answer)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
