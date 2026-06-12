"use client";

import { useT } from "../i18n";
import { AppLink } from "../navigation";

/**
 * Sticky top nav for the suanpan landing page. Anchors jump to in-page
 * sections; the primary CTA opens signup.
 */
export function LandingNav() {
  const { t } = useT("marketing");
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <AppLink
          href="/"
          className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight text-foreground"
        >
          <img
            src="/logo.svg"
            alt="算盘"
            className="h-7 w-7 rounded-md"
          />
          <span>算盘</span>
        </AppLink>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a
            href="#features"
            className="transition-colors hover:text-foreground"
          >
            {t(($) => $.nav.features)}
          </a>
          <a
            href="#integrations"
            className="transition-colors hover:text-foreground"
          >
            {t(($) => $.nav.integrations)}
          </a>
          <a
            href="#chat-demo"
            className="transition-colors hover:text-foreground"
          >
            {t(($) => $.nav.chat_demo)}
          </a>
          <a
            href="#pricing"
            className="transition-colors hover:text-foreground"
          >
            {t(($) => $.nav.pricing)}
          </a>
          <a
            href="#faq"
            className="transition-colors hover:text-foreground"
          >
            {t(($) => $.nav.faq)}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <AppLink
            href="/login"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            {t(($) => $.nav.sign_in)}
          </AppLink>
          <AppLink
            href="/signup"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t(($) => $.nav.sign_up)}
          </AppLink>
        </div>
      </div>
    </header>
  );
}
