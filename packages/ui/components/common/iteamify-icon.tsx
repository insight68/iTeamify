import { useState, useEffect } from "react";
import { cn } from "../../lib/utils";

interface ITeamifyIconProps extends React.ComponentProps<"span"> {
  /**
   * If true, play a one-time entrance spin animation.
   */
  animate?: boolean;
  /**
   * If true, disable hover spin animation.
   */
  noSpin?: boolean;
  /**
   * If true, show a border around the icon.
   */
  bordered?: boolean;
  /**
   * Size of the bordered icon: "sm" (default), "md", "lg"
   */
  size?: "sm" | "md" | "lg";
}

const borderedSizes = {
  sm: { wrapper: "p-1.5", icon: "size-3.5" },
  md: { wrapper: "p-2", icon: "size-4" },
  lg: { wrapper: "p-2.5", icon: "size-5" },
};

/**
 * The iteamify mark, embedded as a data URI rather than imported.
 *
 * `@iteamify/ui` is consumed by two different bundlers — the Next.js web build
 * and the Vite Electron renderer — which type binary asset imports
 * differently (see `provider-logo.tsx` for the same workaround). Inlining
 * gives both consumers one source of truth and keeps the mark off the
 * network path entirely.
 *
 * Source is a 96px master: the component tops out at `size-8` (32px), so this
 * covers 2x displays with headroom.
 */
const MARK_SRC =
    "data:image/png;base64,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";

/**
 * iteamify brand mark.
 *
 * The same blue glyph the favicon, the desktop app icons and the marketing
 * lockup use — a flat blue silhouette with a deeper blue overlay where the two
 * limbs cross, so every surface reads as one brand. `MARK_SRC` below
 * is generated — run `node scripts/generate-brand-assets.mjs` after editing the
 * vector sources in `apps/web/public/` rather than hand-editing the data URI.
 */
export function ITeamifyIcon({
  className,
  animate = false,
  noSpin = false,
  bordered = false,
  size = "sm",
  ...props
}: ITeamifyIconProps) {
  const [entranceDone, setEntranceDone] = useState(!animate);

  useEffect(() => {
    if (!animate) return;
    const timer = setTimeout(() => setEntranceDone(true), 600);
    return () => clearTimeout(timer);
  }, [animate]);

  const mark = (
    <img
      src={MARK_SRC}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="block size-full select-none object-contain"
    />
  );

  if (bordered) {
    const sizeConfig = borderedSizes[size];
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center border border-border rounded-md",
          sizeConfig.wrapper,
          className
        )}
        aria-hidden="true"
        {...props}
      >
        <span
          className={cn(
            "block",
            sizeConfig.icon,
            !entranceDone && "animate-entrance-spin",
            entranceDone && !noSpin && "hover:animate-spin"
          )}
        >
          {mark}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-block size-[1em]",
        !entranceDone && "animate-entrance-spin",
        entranceDone && !noSpin && "hover:animate-spin",
        className
      )}
      aria-hidden="true"
      {...props}
    >
      {mark}
    </span>
  );
}
