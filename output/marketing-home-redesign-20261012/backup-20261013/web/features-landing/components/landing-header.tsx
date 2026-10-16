"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Languages, Menu, X } from "lucide-react";
import { useLocale } from "../i18n";
import { localizedMarketingHref } from "@/lib/marketing-i18n";
import { SERVICE_MARKETING_ROUTES } from "@/lib/service-marketing-routes";
import { BrandLogo, brandLogoName } from "./brand-mark";

type LandingHeaderVariant = "dark" | "light" | "brand";

export function LandingHeader({ variant = "dark", showCta = true }: { variant?: LandingHeaderVariant; transparentAtTop?: boolean; showCta?: boolean }) {
  const { locale, setLocale, session, t } = useLocale();
  const zh = locale === "zh-Hans";
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const navId = useId();
  const href = (path: string) => localizedMarketingHref(path, locale);
  const close = () => {
    setMenuOpen(false);
    headerRef.current?.querySelectorAll("details[open]").forEach((item) => item.removeAttribute("open"));
  };
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setMenuOpen(false);
        headerRef.current?.querySelectorAll("details[open]").forEach((item) => item.removeAttribute("open"));
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  const products = [
    { path: "/features/project-delivery", label: zh ? "项目与交付" : "Projects & delivery" },
  ];
  const solutions = SERVICE_MARKETING_ROUTES.filter((route) => route.kind === "solutions").map((route) => ({ path: route.path, label: zh ? route.zh : route.en }));
  const resources = [
    { path: "/#workflow", label: zh ? "业务流程" : "How it works" },
    { path: "/#faq", label: zh ? "常见问题" : "FAQ" },
    { path: "/about", label: zh ? "关于我们" : "About iteamify" },
    { path: "/contact-sales", label: zh ? "联系团队" : "Talk to our team" },
  ];
  return <header ref={headerRef} className="service-header" data-variant={variant} onKeyDown={(event) => {
    if (event.key !== "Escape") return;
    const details = event.target instanceof Element ? event.target.closest("details") : null;
    if (details?.open) {
      details.removeAttribute("open");
      details.querySelector("summary")?.focus();
    } else {
      close();
      headerRef.current?.querySelector<HTMLButtonElement>(".service-menu-toggle")?.focus();
    }
  }}>
    <a className="service-skip-link" href="#main-content">{zh ? "跳转到主要内容" : "Skip to content"}</a>
    <div className="service-header-inner service-container">
      <Link className="service-logo" href={href("/")} aria-label={brandLogoName(locale)} onClick={close}><BrandLogo locale={locale} /></Link>
      <nav id={navId} className={"service-nav" + (menuOpen ? " is-open" : "")} aria-label={t.header.navigation}>
        {[{ name: zh ? "产品能力" : "Product", links: products }, { name: zh ? "适用团队" : "Solutions", links: solutions }].map((group) => <details key={group.name} name={navId}><summary>{group.name}<ChevronDown size={13} aria-hidden /></summary><div className="service-nav-dropdown">{group.links.map((item) => <Link key={item.path} href={href(item.path)} onClick={close}>{item.label}<ArrowUpRight size={13} aria-hidden /></Link>)}</div></details>)}
        {/* Reads the dictionary instead of a local `zh ?` ternary: the same
            entry existed in the dictionary all along and was never rendered, so
            the nav and the footer drifted apart on the label for this route. */}
        <details name={navId}><summary>{zh ? "资源" : "Resources"}<ChevronDown size={13} aria-hidden /></summary><div className="service-nav-dropdown">{resources.map((item) => <Link key={item.path} href={href(item.path)} onClick={close}>{item.label}<ArrowUpRight size={13} aria-hidden /></Link>)}</div></details>
      </nav>
      <div className="service-header-actions">
        <button className="service-language" type="button" aria-label={zh ? "Switch to English" : "切换到中文"} onClick={() => { close(); setLocale(zh ? "en" : "zh-Hans"); }}><Languages size={15} aria-hidden /><span>{zh ? "EN" : "中文"}</span></button>
        {showCta && !session.isAuthenticated ? <Link className="service-login" href="/login">{zh ? "登录" : "Log in"}</Link> : null}
        {showCta ? <Link className="service-button service-button-primary" href={session.ctaHref}>{session.isAuthenticated ? t.header.dashboard : t.header.cta}</Link> : null}
        <button className="service-menu-toggle" type="button" aria-label={menuOpen ? t.header.closeMenu : t.header.openMenu} aria-expanded={menuOpen} aria-controls={navId} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={21} aria-hidden /> : <Menu size={21} aria-hidden />}</button>
      </div>
    </div>
  </header>;
}
