const DEFAULT_TITLE_MAX = 200;
const DEFAULT_BODY_MAX = 300;

/**
 * Flatten markdown into a bounded two-part preview suitable for a minimap
 * label/card. Fenced code is omitted because it is noisy and can be very
 * large; link and image labels remain useful human-readable context.
 */
export function minimapMarkdownPreview(
  markdown: string,
  limits: { title?: number; body?: number } = {},
): { title: string; body: string } {
  const lines = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, "")
        .replace(/[#*`>~]/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);

  return {
    title: (lines[0] ?? "").slice(0, limits.title ?? DEFAULT_TITLE_MAX),
    body: lines.slice(1).join(" ").slice(0, limits.body ?? DEFAULT_BODY_MAX),
  };
}
