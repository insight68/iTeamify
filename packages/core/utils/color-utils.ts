/**
 * Validates hex color format.
 * Accepts #RRGGBB, #RGB, RRGGBB, RGB formats (case-insensitive).
 */
export function isValidHexColor(color: string): boolean {
  if (!color) return false;
  const hex = color.replace(/^#/, "");
  return /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(hex);
}

/**
 * Converts hex color to light background style string.
 * Uses ~10% opacity for good readability.
 * Returns empty string for invalid input.
 */
export function hexToRowBackground(hex: string): string {
  if (!isValidHexColor(hex)) return "";

  let cleanHex = hex.replace(/^#/, "");

  // Expand 3-digit hex to 6-digit
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split("")
      .map((c) => c + c)
      .join("");
  }

  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, 0.1)`;
}
