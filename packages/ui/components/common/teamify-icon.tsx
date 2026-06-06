import { useState, useEffect } from "react";
import { cn } from "../../lib/utils";

interface TeamifyIconProps extends React.ComponentProps<"span"> {
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
 * Teamify flame icon matching the favicon design.
 * Uses currentColor so it adapts to light/dark themes automatically.
 * Flame path traced from the favicon.svg design.
 */
export function TeamifyIcon({
  className,
  animate = false,
  noSpin = false,
  bordered = false,
  size = "sm",
  ...props
}: TeamifyIconProps) {
  const [entranceDone, setEntranceDone] = useState(!animate);

  useEffect(() => {
    if (!animate) return;
    const timer = setTimeout(() => setEntranceDone(true), 600);
    return () => clearTimeout(timer);
  }, [animate]);

  // Flame path from favicon.svg - normalized to 512x512 viewBox
  const flamePath =
    "M140,180 C120,150 160,110 240,115 C320,120 420,100 440,180 C450,220 400,200 360,185 C320,170 280,180 260,240 C235,320 270,420 230,460 C190,500 160,420 180,350 C200,280 230,250 250,210 C270,170 230,165 200,170 C170,175 160,210 140,180 Z";

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
          <svg
            viewBox="0 0 512 512"
            className="block size-full text-current"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d={flamePath} />
            <circle cx="256" cy="480" r="8" fill="currentColor" opacity="0.6" />
          </svg>
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
      <svg
        viewBox="0 0 512 512"
        className="block size-full text-current"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d={flamePath} />
        <circle cx="256" cy="480" r="8" fill="currentColor" opacity="0.6" />
      </svg>
    </span>
  );
}
