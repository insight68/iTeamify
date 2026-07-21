"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@teamify/ui/components/ui/sheet";
import { AppLink } from "../navigation";
import { useT } from "../i18n";

// Extracted from LandingNav so the Sheet (base-ui dialog) can be code-split:
// desktop visitors never open the mobile menu, so shipping its JS in the
// initial nav chunk is pure waste. LandingNav lazy-loads this component on
// first open via React.lazy + a Suspense boundary.
export interface MobileNavItem {
  href: string;
  label: string;
  active: boolean;
}

interface MobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ReadonlyArray<MobileNavItem>;
}

export function MobileMenu({ open, onOpenChange, items }: MobileMenuProps) {
  const { t } = useT("marketing");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
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
          {items.map((item) => (
            <AppLink
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={
                item.active
                  ? "rounded-md bg-muted px-3 py-3 text-sm font-medium text-foreground"
                  : "rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              }
              onClick={() => onOpenChange(false)}
            >
              {item.label}
            </AppLink>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
