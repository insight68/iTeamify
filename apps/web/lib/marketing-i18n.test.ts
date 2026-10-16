import { describe, expect, it } from "vitest";
import {
  englishMarketingPath,
  localizedMarketingHref,
  localizedMarketingPath,
  marketingLocaleFromPathname,
} from "./marketing-i18n";

describe("marketing locale routing", () => {
  it.each([
    ["/", "en"],
    ["/about", "en"],
    ["/privacy", "en"],
    ["/terms", "en"],
    ["/zh-cn", "zh-Hans"],
    ["/zh-cn/contact-sales", "zh-Hans"],
    ["/zh-cn/creators", "zh-Hans"],
    ["/zh-cn/privacy", "zh-Hans"],
    ["/zh-cn/terms", "zh-Hans"],
  ] as const)("resolves %s as %s", (pathname, locale) => {
    expect(marketingLocaleFromPathname(pathname)).toBe(locale);
  });

  it.each(["/login", "/acme/issues", "/experts/acme", "/zh-cn/unknown"])(
    "does not claim non-marketing path %s",
    (pathname) => {
      expect(marketingLocaleFromPathname(pathname)).toBeNull();
    },
  );

  it("maps equivalent English and Chinese routes", () => {
    expect(localizedMarketingPath("/about", "zh-Hans")).toBe(
      "/zh-cn/about",
    );
    expect(localizedMarketingPath("/zh-cn/about", "en")).toBe("/about");
    expect(englishMarketingPath("/zh-cn")).toBe("/");
    expect(localizedMarketingPath("/creators", "zh-Hans")).toBe(
      "/zh-cn/creators",
    );
  });

  it("preserves query strings and hashes while localizing links", () => {
    expect(localizedMarketingHref("/#features", "zh-Hans")).toBe(
      "/zh-cn#features",
    );
    expect(
      localizedMarketingHref("/contact-sales?from=home#cli", "zh-Hans"),
    ).toBe("/zh-cn/contact-sales?from=home#cli");
  });

  it("leaves external and hash-only links unchanged", () => {
    expect(localizedMarketingHref("https://example.com", "zh-Hans")).toBe(
      "https://example.com",
    );
    expect(localizedMarketingHref("#faq", "zh-Hans")).toBe("#faq");
  });
});
