import type { Metadata } from "next";
import { SITE_CONFIG } from "@/config/site";
import {
  MARKETING_HREFLANG,
  MARKETING_OG_LOCALE,
  localizedMarketingPath,
  type MarketingLocale,
} from "./marketing-i18n";

export type MarketingPage =
  | "home"
  | "about"
  | "contact-sales"
  | "creators"
  | "privacy"
  | "terms";

const PAGE_PATH: Record<MarketingPage, string> = {
  home: "/",
  about: "/about",
  "contact-sales": "/contact-sales",
  creators: "/creators",
  privacy: "/privacy",
  terms: "/terms",
};

const SEO_COPY: Record<MarketingLocale, Record<MarketingPage, {
  title: string;
  description: string;
}>> = {
  en: {
    home: {
      title: "iteamify | Export Buyer Signals, Quotes & Orders",
      description:
        "Overseas buyers leave traces before they buy: a new production line, a procurement hire, a supplier switch, a new channel. iteamify turns those public traces into signals with sources attached, and keeps inquiries, quotes, orders and repeat business in one workspace.",
    },
    about: {
      title: "About iteamify",
      description:
        "Learn why we built iteamify: helping Chinese export businesses find the buyers worth their time, with a public source attached to every signal.",
    },
    "contact-sales": {
      title: "Contact iteamify Sales",
      description:
        "Talk with iteamify about buyer signals, export quotes and orders, and keeping repeat business for your export company.",
    },
    creators: {
      title: "Creator Paths — Choose Your Next Growth Move | iteamify",
      description:
        "Compare sixteen creator platforms by business model, then use iteamify to turn one path into a focused operating experiment.",
    },
    privacy: {
      title: "Privacy Policy | iteamify",
      description:
        "How iteamify collects, uses, stores, and protects your personal information when you use iteamify, and the choices and rights you control.",
    },
    terms: {
      title: "Terms of Service | iteamify",
      description:
        "The terms that govern your use of the iteamify product, websites, and related services provided by iteamify.",
    },
  },
  "zh-Hans": {
    home: {
      title: "iteamify｜外贸买家信号与出口业务管理",
      description:
        "海外买家在采购之前会留下痕迹：新建产线、扩编采购团队、切换供应商、开新渠道。iteamify 把这些公开痕迹整理成可核查的信号，并把询盘、报价、订单和老客户复购放进同一个工作空间。",
    },
    about: {
      title: "关于 iteamify",
      description:
        "了解我们为什么打造 iteamify：为中国外贸企业找到值得跟的买家，每条信号都附公开原文出处。",
    },
    "contact-sales": {
      title: "联系 iteamify 销售团队",
      description:
        "与 iteamify 团队沟通买家信号、出口报价与订单管理，以及外贸客户复购的跟进方式。",
    },
    creators: {
      title: "中国创作者出海导航｜iteamify",
      description:
        "面向中国大陆创作者的出海指南：完整了解 16 个常用平台，从已有能力出发，选择专业服务、教学、数字产品、课程或内容创作路径，并用 iteamify 制定执行计划。",
    },
    privacy: {
      title: "隐私政策｜iteamify",
      description:
        "了解 iteamify 在你使用 iteamify 时如何收集、使用、存储和保护你的个人信息，以及你掌控的选择与权利。",
    },
    terms: {
      title: "服务条款｜iteamify",
      description:
        "iteamify 提供 iteamify 产品、网站及相关服务的使用条款。",
    },
  },
};

export function createMarketingMetadata(
  page: MarketingPage,
  locale: MarketingLocale,
  /**
   * Detail routes cannot derive their canonical path from the page key, so they
   * pass the concrete path (for example `/opportunities/<ref>`). Everything
   * else uses the shared path table.
   */
  options?: { path?: string },
): Metadata {
  const copy = SEO_COPY[locale][page];
  const basePath = options?.path ?? PAGE_PATH[page];
  const englishPath = localizedMarketingPath(basePath, "en");
  const chinesePath = localizedMarketingPath(basePath, "zh-Hans");
  const canonical = localizedMarketingPath(basePath, locale);
  const socialImage = locale === "zh-Hans"
    ? "/zh-cn/opengraph-image"
    : "/opengraph-image";

  return {
    title: { absolute: copy.title },
    description: copy.description,
    alternates: {
      canonical,
      languages: {
        [MARKETING_HREFLANG.en]: englishPath,
        [MARKETING_HREFLANG["zh-Hans"]]: chinesePath,
        "x-default": englishPath,
      },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: SITE_CONFIG.siteName,
      title: copy.title,
      description: copy.description,
      url: canonical,
      locale: MARKETING_OG_LOCALE[locale],
      alternateLocale: [
        MARKETING_OG_LOCALE[locale === "en" ? "zh-Hans" : "en"],
      ],
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: locale === "zh-Hans"
            ? "iteamify 外贸买家信号与出口业务管理系统"
            : `${SITE_CONFIG.productName} by ${SITE_CONFIG.organizationName}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: [socialImage],
    },
  };
}
