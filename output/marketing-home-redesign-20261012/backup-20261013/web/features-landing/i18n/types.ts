import type { SupportedLocale } from "@iteamify/core/i18n";

export type Locale = Extract<SupportedLocale, "en" | "zh-Hans">;
export type LandingDictionaryLocale = "en" | "zh";

export const locales: Locale[] = ["en", "zh-Hans"];

export const localeLabels: Record<Locale, string> = {
  en: "EN",
  "zh-Hans": "\u4e2d\u6587",
};

export function toLandingDictionaryLocale(
  locale: SupportedLocale,
): LandingDictionaryLocale {
  return locale === "zh-Hans" ? "zh" : "en";
}

export function isZhLocale(locale: Locale): boolean {
  return locale === "zh-Hans";
}

type FooterGroup = {
  label: string;
  links: { label: string; href: string }[];
};

export type LegalSection = {
  heading: string;
  paragraphs: string[];
};

type LegalPageDict = {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
};

export type ContactSalesOption = { value: string; label: string };

export type LandingDict = {
  header: {
    cta: string;
    dashboard: string;
    product: string;
    whyUs: string;
    faq: string;
    navigation: string;
    openMenu: string;
    closeMenu: string;
  };
  footer: {
    tagline: string;
    cta: string;
    wechat: { title: string; description: string };
    groups: {
      product: FooterGroup;
      resources: FooterGroup;
      company: FooterGroup;
      legal: FooterGroup;
    };
    copyright: string;
  };
  about: {
    title: string;
    nameLine: {
      prefix: string;
      mul: string;
      tiplexed: string;
      i: string;
      nformationAnd: string;
      c: string;
      omputing: string;
      a: string;
      gent: string;
    };
    paragraphs: string[];
    cta: string;
  };
  contactSales: {
    pageTitle: string;
    pageDescription: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    notice: { badge: string; body: string };
    fields: {
      firstName: string;
      lastName: string;
      businessEmail: string;
      businessEmailHint: string;
      companyName: string;
      companySize: string;
      countryRegion: string;
      useCase: string;
      goals: string;
      goalsHint: string;
      selectPlaceholder: string;
      submit: string;
      submitting: string;
    };
    companySizes: ContactSalesOption[];
    useCases: ContactSalesOption[];
    countries: string[];
    consent: {
      intro: string;
      outreach: string;
      updates: string;
      unsubscribe: string;
      submitConsent: string;
      privacyLinkLabel: string;
      privacyLinkHref: string;
    };
    success: { title: string; message: string; cta: string };
    errors: {
      generic: string;
      rateLimit: string;
      freeEmail: string;
      invalidEmail: string;
    };
  };
  privacy: LegalPageDict;
  terms: LegalPageDict;
};
