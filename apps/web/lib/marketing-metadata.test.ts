import { describe, expect, it } from "vitest";
import { createMarketingMetadata } from "./marketing-metadata";

describe("marketing metadata", () => {
  it("creates a self-canonical English page with reciprocal alternates", () => {
    const metadata = createMarketingMetadata("about", "en");
    expect(metadata.alternates?.canonical).toBe("/about");
    expect(metadata.alternates?.languages).toEqual({
      en: "/about",
      "zh-CN": "/zh-cn/about",
      "x-default": "/about",
    });
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it("localizes Chinese SEO copy and canonical", () => {
    const metadata = createMarketingMetadata("home", "zh-Hans");
    expect(metadata.title).toEqual({
      absolute: "iteamify｜团队与智能体协作",
    });
    expect(metadata.alternates?.canonical).toBe("/zh-cn");
    expect(metadata.openGraph).toMatchObject({
      locale: "zh_CN",
      alternateLocale: ["en_US"],
      url: "/zh-cn",
    });
  });

  it("publishes reciprocal creator navigator metadata", () => {
    const metadata = createMarketingMetadata("creators", "zh-Hans");

    expect(metadata.title).toEqual({
      absolute: "中国创作者出海导航｜iteamify",
    });
    expect(metadata.alternates?.canonical).toBe("/zh-cn/creators");
    expect(metadata.alternates?.languages).toEqual({
      en: "/creators",
      "zh-CN": "/zh-cn/creators",
      "x-default": "/creators",
    });
  });

});
