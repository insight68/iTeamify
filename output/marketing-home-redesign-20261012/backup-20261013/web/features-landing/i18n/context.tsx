"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserCookieLocaleAdapter } from "@iteamify/core/i18n/browser";
import type { SupportedLocale } from "@iteamify/core/i18n";
import type { MarketingSession } from "@/lib/marketing-session";
import {
  localizedMarketingHref,
  MARKETING_HTML_LANG,
  marketingLocaleFromPathname,
  normalizeMarketingLocale,
} from "@/lib/marketing-i18n";
import { createEnDict } from "./en";
import { createZhDict } from "./zh";
import {
  toLandingDictionaryLocale,
  type LandingDict,
  type LandingDictionaryLocale,
  type Locale,
} from "./types";

const dictionaryFactories: Record<
  LandingDictionaryLocale,
  (allowSignup: boolean) => LandingDict
> = {
  en: createEnDict,
  zh: createZhDict,
};

type LocaleContextValue = {
  locale: Locale;
  t: LandingDict;
  setLocale: (locale: Locale) => void;
  session: MarketingSession;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale = "en",
  initialSession = { isAuthenticated: false, ctaHref: "/login" },
}: {
  children: React.ReactNode;
  initialLocale?: SupportedLocale;
  initialSession?: MarketingSession;
}) {
  const [selectedLocale, setSelectedLocale] = useState<Locale>(() =>
    normalizeMarketingLocale(initialLocale),
  );
  const router = useRouter();
  const pathname = usePathname();
  const routeLocale = marketingLocaleFromPathname(pathname);
  const locale = routeLocale ?? selectedLocale;
  const localeAdapter = useMemo(() => createBrowserCookieLocaleAdapter(), []);
  const [allowSignup, setAllowSignup] = useState(true);
  const t = useMemo(
    () => dictionaryFactories[toLandingDictionaryLocale(locale)](allowSignup),
    [allowSignup, locale],
  );

  // Marketing only needs the public signup flag. Keep this request independent
  // from the authenticated CoreProvider so the homepage does not initialize
  // auth, workspaces, React Query or WebSocket merely to choose CTA copy.
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/config", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((config: unknown) => {
        if (
          config &&
          typeof config === "object" &&
          "allow_signup" in config &&
          typeof config.allow_signup === "boolean"
        ) {
          setAllowSignup(config.allow_signup);
        }
      })
      .catch(() => {
        // Public config is optional; the managed-cloud default is signup enabled.
      });
    return () => controller.abort();
  }, []);

  // The root layout does not remount during a client-side locale switch, so
  // keep the document language in sync for screen readers and CJK font
  // fallback. Direct requests still receive the same value from layout.tsx.
  useEffect(() => {
    document.documentElement.lang = MARKETING_HTML_LANG[locale];
  }, [locale]);

  const setLocale = useCallback(
    (l: Locale) => {
      if (l === locale) return;
      setSelectedLocale(l);
      localeAdapter.persist(l);
      if (routeLocale) {
        const currentHref = `${pathname}${window.location.search}${window.location.hash}`;
        router.push(localizedMarketingHref(currentHref, l));
        return;
      }
      router.refresh();
    },
    [locale, localeAdapter, pathname, routeLocale, router],
  );

  return (
    <LocaleContext.Provider value={{ locale, t, setLocale, session: initialSession }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = use(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
