"use client";

import { useEffect, useState } from "react";
import { cn } from "@iteamify/ui/lib/utils";

export const CREATOR_NOUNS = ["技能", "品位", "审美", "能力", "手艺"] as const;

const WORD_INTERVAL_MS = 1800;

type WordState = {
  active: number;
  previous: number | null;
};

export function DynamicCreatorNoun() {
  const [wordState, setWordState] = useState<WordState>({
    active: 0,
    previous: null,
  });

  useEffect(() => {
    const reducedMotion =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    let interval: number | undefined;

    const syncAnimation = () => {
      window.clearInterval(interval);
      setWordState({ active: 0, previous: null });

      if (reducedMotion?.matches) return;

      interval = window.setInterval(() => {
        setWordState(({ active }) => ({
          active: (active + 1) % CREATOR_NOUNS.length,
          previous: active,
        }));
      }, WORD_INTERVAL_MS);
    };

    syncAnimation();
    reducedMotion?.addEventListener("change", syncAnimation);

    return () => {
      window.clearInterval(interval);
      reducedMotion?.removeEventListener("change", syncAnimation);
    };
  }, []);

  return (
    <span
      aria-hidden="true"
      className="relative inline-grid w-[2em] grid-cols-1 align-baseline"
    >
      {CREATOR_NOUNS.map((word, index) => (
        <span
          key={word}
          className={cn(
            "col-start-1 row-start-1 transition-[opacity,transform,filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            index === wordState.active
              ? "translate-y-0 opacity-100 blur-0"
              : index === wordState.previous
                ? "-translate-y-[0.22em] opacity-0 blur-[4px]"
                : "translate-y-[0.22em] opacity-0 blur-[4px]",
          )}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
