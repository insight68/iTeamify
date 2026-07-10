"use client";

import { ArrowRight, Bot, UserCheck } from "lucide-react";
import { useT } from "../i18n";

const WORKFLOW_KEYS = ["step_1", "step_2", "step_3", "step_4"] as const;

export function ChatDemoSection() {
  const { t } = useT("marketing");

  const messages = [
    { role: "user" as const, text: t(($) => $.chat_demo.messages.user_1) },
    { role: "assistant" as const, text: t(($) => $.chat_demo.messages.assistant_1) },
    { role: "assistant" as const, text: t(($) => $.chat_demo.messages.assistant_2) },
  ];

  return (
    <section
      id="chat-demo"
      aria-labelledby="chat-demo-heading"
      className="border-b border-border/60 bg-muted/30 py-20 md:py-28"
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-4 md:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.chat_demo.eyebrow)}
          </p>
          <h2
            id="chat-demo-heading"
            className="mt-2 text-balance font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.chat_demo.heading)}
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
            {t(($) => $.chat_demo.subtitle)}
          </p>

          <div className="mt-8 rounded-lg border border-border/70 bg-card p-4 shadow-sm">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] whitespace-pre-line rounded-lg px-4 py-3 text-sm leading-6 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "border border-border/70 bg-background text-foreground"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <span className="mb-2 flex items-center gap-2 font-semibold text-brand">
                        <Bot className="size-4" aria-hidden />
                        iTeamify
                      </span>
                    )}
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 border-t border-border/60 pt-3 text-center text-xs text-muted-foreground">
              {t(($) => $.chat_demo.footer_note)}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-lg ring-1 ring-foreground/5 md:p-5">
          <div className="space-y-3">
            {WORKFLOW_KEYS.map((key, index) => (
              <div
                key={key}
                className="grid gap-3 rounded-lg border border-border/70 bg-background/80 p-4 sm:grid-cols-[auto_1fr] sm:items-start"
              >
                <div className="flex items-center gap-3 sm:flex-col">
                  <span className="flex size-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">
                    {index + 1}
                  </span>
                  {index < WORKFLOW_KEYS.length - 1 && (
                    <ArrowRight
                      className="hidden size-4 rotate-90 text-muted-foreground sm:block"
                      aria-hidden
                    />
                  )}
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-brand">
                    {t(($) => $.chat_demo.workflow[key].label)}
                  </span>
                  <h3 className="mt-1 font-heading text-base font-semibold text-foreground">
                    {t(($) => $.chat_demo.workflow[key].title)}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t(($) => $.chat_demo.workflow[key].body)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
            <UserCheck className="size-4" aria-hidden />
            {t(($) => $.chat_demo.approval_note)}
          </div>
        </div>
      </div>
    </section>
  );
}
