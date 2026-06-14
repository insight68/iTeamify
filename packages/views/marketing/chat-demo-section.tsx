"use client";

import { useT } from "../i18n";

/**
 * Chat-based operation demo showing how suanpan AI
 * handles reconciliation through natural conversation.
 */
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
      <div className="mx-auto max-w-4xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.chat_demo.eyebrow)}
          </p>
          <h2
            id="chat-demo-heading"
            className="mt-2 font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.chat_demo.heading)}
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            {t(($) => $.chat_demo.subtitle)}
          </p>
        </div>
        <div className="mt-12">
          <div className="mx-auto max-w-2xl rounded-2xl border border-border/60 bg-card p-6 shadow-lg md:p-8">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "bg-brand text-brand-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <span className="mr-2 font-semibold">iTeamify</span>
                    )}
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-center text-xs text-muted-foreground">
              {t(($) => $.chat_demo.footer_note)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
