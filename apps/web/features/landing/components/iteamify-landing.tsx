import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import type { MarketingLocale } from "@/lib/marketing-i18n";
import type { MarketingSession } from "@/lib/marketing-session";
import { getLandingDict, toLandingDictionaryLocale } from "../i18n";
import { LandingHeader } from "./landing-header";
import { LandingFooter } from "./landing-footer";

/**
 * Homepage. This is a server component, so copy comes from `getLandingDict`
 * rather than from the client locale hook: the dictionary is resolved from the
 * route locale at render time, and the header/footer pick up the client context
 * inside the same provider tree.
 */
export function ITeamifyLanding({
  locale,
  session,
}: {
  locale: MarketingLocale;
  session: MarketingSession;
}) {
  const t = getLandingDict(toLandingDictionaryLocale(locale));
  const home = t.home;
  const primaryHref = session.ctaHref;
  const primaryLabel = session.isAuthenticated
    ? t.header.dashboard
    : home.hero.primaryCta;

  return (
    <div className="service-site mh-home">
      <LandingHeader variant="brand" transparentAtTop={false} />
      <main id="main-content">
        <section className="mh-hero">
          <div className="mh-shell">
            <p className="mh-eyebrow">{home.eyebrow}</p>
            <h1 className="mh-h1">{home.hero.title}</h1>
            <p className="mh-lead">{home.hero.lead}</p>
            <div className="mh-actions">
              <Link className="mh-btn mh-btn--primary" href={primaryHref}>
                {primaryLabel}
                <ArrowRight size={16} aria-hidden />
              </Link>
              <Link className="mh-btn mh-btn--secondary" href="#lifecycle">
                {home.hero.secondaryCta}
              </Link>
            </div>
            <p className="mh-cli-note">{home.hero.cliNote}</p>
            <div className="mh-board">
              {home.hero.boardColumns.map((column) => (
                <div className="mh-board-col" key={column.label}>
                  <p className="mh-board-label">{column.label}</p>
                  {column.cards.map((card) => (
                    <article className="mh-card" key={card.title}>
                      <p className="mh-card-title">{card.title}</p>
                      <div className="mh-card-who">
                        <span
                          className={`mh-avatar mh-avatar--${card.kind}`}
                          aria-hidden
                        >
                          {card.kind === "agent" ? "A" : "L"}
                        </span>
                        <span>{card.who}</span>
                        {card.kind === "agent" ? (
                          <span className="mh-status-live" aria-hidden />
                        ) : null}
                        <span className="mh-card-meta">{card.meta}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mh-sec">
          <div className="mh-shell">
            <div className="mh-heading">
              <p className="mh-eyebrow">{home.pains.eyebrow}</p>
              <h2 className="mh-h2">{home.pains.title}</h2>
              <p className="mh-lead">{home.pains.lead}</p>
            </div>
            <div className="mh-pain-grid">
              {home.pains.items.map((item) => (
                <article className="mh-pain" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mh-sec mh-sec--tint" id="agents">
          <div className="mh-shell mh-split">
            <div>
              <p className="mh-eyebrow">{home.mechanism.eyebrow}</p>
              <h2 className="mh-h2">{home.mechanism.title}</h2>
              <p className="mh-lead">{home.mechanism.body}</p>
              <p className="mh-note">{home.mechanism.note}</p>
            </div>
            <div className="mh-panel">
              <p className="mh-panel-label">{home.mechanism.assigneeLabel}</p>
              {home.mechanism.assignees.map((assignee) => (
                <div className="mh-assignee-row" key={assignee.name}>
                  <span
                    className={`mh-avatar mh-avatar--${assignee.kind}`}
                    aria-hidden
                  >
                    {assignee.kind === "agent" ? "A" : "L"}
                  </span>
                  <span>{assignee.name}</span>
                  <span className={`mh-badge mh-badge--${assignee.kind}`}>
                    {assignee.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mh-sec" id="capabilities">
          <div className="mh-shell">
            <div className="mh-heading">
              <p className="mh-eyebrow">{home.capabilities.eyebrow}</p>
              <h2 className="mh-h2">{home.capabilities.title}</h2>
              <p className="mh-lead">{home.capabilities.lead}</p>
            </div>
            <div className="mh-cap-grid">
              {home.capabilities.items.map((item) => (
                <article className="mh-cap" key={item.title}>
                  <h3 className="mh-h3">{item.title}</h3>
                  <p>{item.body}</p>
                  <ul>
                    {item.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mh-sec mh-sec--line" id="lifecycle">
          <div className="mh-shell">
            <div className="mh-heading">
              <p className="mh-eyebrow">{home.lifecycle.eyebrow}</p>
              <h2 className="mh-h2">{home.lifecycle.title}</h2>
              <p className="mh-lead">{home.lifecycle.lead}</p>
            </div>
            <div className="mh-steps">
              {home.lifecycle.steps.map((step, index) => (
                <article className="mh-step" key={step.label}>
                  <span className="mh-step-label">
                    {String(index + 1).padStart(2, "0")} · {step.label}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mh-sec">
          <div className="mh-shell">
            <div className="mh-heading">
              <p className="mh-eyebrow">{home.scale.eyebrow}</p>
              <h2 className="mh-h2">{home.scale.title}</h2>
              <p className="mh-lead">{home.scale.lead}</p>
            </div>
            <div className="mh-cap-grid">
              {home.scale.items.map((item) => (
                <article className="mh-cap" key={item.title}>
                  <h3 className="mh-h3">{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mh-sec mh-sec--tint" id="architecture">
          <div className="mh-shell mh-split">
            <div>
              <p className="mh-eyebrow">{home.architecture.eyebrow}</p>
              <h2 className="mh-h2">{home.architecture.title}</h2>
              <p className="mh-lead">{home.architecture.body}</p>
              <ul className="mh-points">
                {home.architecture.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
            <div className="mh-arch">
              <div className="mh-arch-node mh-arch-node--client">
                <strong>{home.architecture.diagram.client}</strong>
                <span>{home.architecture.diagram.clientNote}</span>
              </div>
              <div className="mh-arch-node">
                <strong>{home.architecture.diagram.server}</strong>
                <span>{home.architecture.diagram.serverNote}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mh-sec" id="comparison">
          <div className="mh-shell">
            <div className="mh-heading">
              <p className="mh-eyebrow">{home.comparison.eyebrow}</p>
              <h2 className="mh-h2">{home.comparison.title}</h2>
              <p className="mh-lead">{home.comparison.lead}</p>
            </div>
            <div className="mh-compare">
              {home.comparison.columns.map((column) => (
                <div className="mh-compare-col" key={column.title}>
                  <h3>{column.title}</h3>
                  <ul>
                    {column.rows.map((row) => (
                      <li key={row}>{row}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mh-sec" id="solutions">
          <div className="mh-shell">
            <div className="mh-heading">
              <p className="mh-eyebrow">{home.audiences.eyebrow}</p>
              <h2 className="mh-h2">{home.audiences.title}</h2>
              <p className="mh-lead">{home.audiences.lead}</p>
            </div>
            <div className="mh-audience-grid">
              {home.audiences.items.map((item) => (
                <article className="mh-audience" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mh-sec mh-sec--line" id="faq">
          <div className="mh-shell mh-faq">
            <div>
              <p className="mh-eyebrow">{home.faq.eyebrow}</p>
              <h2 className="mh-h2">{home.faq.title}</h2>
            </div>
            <div>
              {home.faq.items.map((item, index) => (
                <details key={item.question} open={index === 0}>
                  <summary>
                    {item.question}
                    <ChevronRight size={17} aria-hidden />
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mh-final" id="start">
          <div className="mh-shell">
            <p className="mh-eyebrow">{home.finalCta.eyebrow}</p>
            <h2 className="mh-h2">{home.finalCta.title}</h2>
            <p className="mh-lead">{home.finalCta.note}</p>
            <div className="mh-actions">
              <Link className="mh-btn mh-btn--primary" href={primaryHref}>
                {primaryLabel}
                <ArrowRight size={16} aria-hidden />
              </Link>
              <Link className="mh-btn mh-btn--secondary" href="/contact-sales">
                {t.contactSales.eyebrow}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
