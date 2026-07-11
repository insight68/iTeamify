"use client";

import { Button } from "@teamify/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@teamify/ui/components/ui/sheet";
import { Menu } from "lucide-react";
import { useState } from "react";
import { useT } from "../i18n";
import { AppLink, useNavigation } from "../navigation";

/**
 * Sticky top nav for the operating-agent landing page.
 */
export function LandingNav() {
  const { t } = useT("marketing");
  const { pathname } = useNavigation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navItems = [
    {
      href: "/",
      label: t(($) => $.nav.home),
      active: pathname === "/",
    },
    {
      href: "/duizhang",
      label: t(($) => $.nav.reconciliation),
      active: pathname === "/duizhang",
    },
    {
      href: "/#pricing",
      label: t(($) => $.nav.pricing),
      active: false,
    },
    {
      href: "/#faq",
      label: t(($) => $.nav.faq),
      active: false,
    },
  ] as const;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <AppLink
          href="/"
          className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight text-foreground"
        >
          <img
            src="/logo.png"
            alt=""
            aria-hidden
            className="h-7 w-7 rounded-md"
          />
          <span>iTeamify</span>
        </AppLink>
        <nav
          aria-label={t(($) => $.nav.primary_navigation)}
          className="hidden items-center gap-6 text-sm text-muted-foreground md:flex"
        >
          {navItems.map((item) => (
            <AppLink
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={
                item.active
                  ? "font-medium text-foreground"
                  : "transition-colors hover:text-foreground"
              }
            >
              {item.label}
            </AppLink>
          ))}
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
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label={t(($) => $.nav.open_menu)}
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="right" className="w-[min(20rem,85vw)] gap-0 p-0">
          <SheetHeader className="border-b border-border px-5 py-5">
            <SheetTitle>iTeamify</SheetTitle>
            <SheetDescription className="sr-only">
              {t(($) => $.nav.primary_navigation)}
            </SheetDescription>
          </SheetHeader>
          <nav
            aria-label={t(($) => $.nav.primary_navigation)}
            className="flex flex-col px-3 py-4"
          >
            {navItems.map((item) => (
              <AppLink
                key={item.href}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={
                  item.active
                    ? "rounded-md bg-muted px-3 py-3 text-sm font-medium text-foreground"
                    : "rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                }
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </AppLink>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
